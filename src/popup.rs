//! Window placement and click ordering, independent of Windows handles.

pub const INITIAL_SIZE: (u32, u32) = (400, 320);
const EDGE_GAP: f64 = 12.0;

/// How far the flyout travels while it slides, in logical pixels, and how long a
/// full travel lasts. Like the Windows tray flyouts, it rises into place and
/// drops away faster than it arrived.
pub const SLIDE: f64 = 32.0;
pub const OPEN_MS: u64 = 220;
pub const CLOSE_MS: u64 = 140;
pub const FRAME_MS: u64 = 10;
const SHORTEST_MS: u64 = 60;

/// Eased offset between two points of a slide. Opening decelerates into place;
/// closing accelerates away so a dismissal never feels like it is dragging.
pub fn slide(from: f64, to: f64, elapsed: u64, duration: u64) -> f64 {
    if duration == 0 || elapsed >= duration {
        return to;
    }
    let t = elapsed as f64 / duration as f64;
    let eased = if to < from { 1.0 - (1.0 - t).powi(3) } else { t * t };
    from + (to - from) * eased
}

/// A reversed slide only covers the distance left, so toggling the tray twice
/// does not crawl through a full-length animation.
pub fn slide_duration(from: f64, to: f64, full: u64) -> u64 {
    let share = ((to - from).abs() / SLIDE).clamp(0.0, 1.0);
    if share == 0.0 {
        return 0;
    }
    ((full as f64 * share).round() as u64).max(SHORTEST_MS)
}

/// Physical shift for a logical slide offset on the popup's monitor.
pub fn shift(offset: f64, scale: f64) -> i32 {
    (offset * scale).round() as i32
}

/// Drives the open and close slide. Starting one invalidates the frames still
/// queued from the slide it replaces, so a reversal never fights its predecessor.
#[derive(Default)]
pub struct Motion {
    generation: u64,
    offset: f64,
    closing: bool,
    reduced: bool,
}

impl Motion {
    pub fn set_reduced(&mut self, reduced: bool) {
        self.reduced = reduced;
    }

    /// A closing popup is on its way out: the tray must treat it as shut so the
    /// next click reopens it instead of closing it again.
    pub fn closing(&self) -> bool {
        self.closing
    }

    pub fn offset(&self) -> f64 {
        self.offset
    }

    /// Start a slide and report its generation and duration. A hidden popup
    /// always opens from the full travel; a visible one resumes where it stands.
    /// A zero duration means the caller should finish the move immediately.
    pub fn begin(&mut self, closing: bool, visible: bool) -> (u64, u64) {
        self.generation = self.generation.wrapping_add(1);
        self.closing = closing;
        if !closing && !visible {
            self.offset = if self.reduced { 0.0 } else { SLIDE };
        }
        let to = if closing { SLIDE } else { 0.0 };
        let full = if closing { CLOSE_MS } else { OPEN_MS };
        let duration = if self.reduced { 0 } else { slide_duration(self.offset, to, full) };
        if duration == 0 && !closing {
            self.offset = 0.0;
        }
        (self.generation, duration)
    }

    /// Record one frame, ignoring any left over from a slide already replaced.
    pub fn advance(&mut self, generation: u64, offset: f64) -> bool {
        if self.generation != generation {
            return false;
        }
        self.offset = offset;
        true
    }

    /// Finish a close: the popup may hide and the next open starts level again.
    pub fn settle(&mut self, generation: u64) -> bool {
        if self.generation != generation {
            return false;
        }
        self.offset = 0.0;
        self.closing = false;
        true
    }
}

#[derive(Default)]
pub struct Interaction {
    generation: u64,
    pressed_open: Option<bool>,
}

impl Interaction {
    pub fn cancel(&mut self) {
        self.refocus();
        self.pressed_open = None;
    }

    pub fn refocus(&mut self) {
        self.generation = self.generation.wrapping_add(1);
    }

    pub fn blur(&mut self) -> u64 {
        self.refocus();
        self.generation
    }

    pub fn should_dismiss(&self, generation: u64) -> bool {
        self.generation == generation && self.pressed_open.is_none()
    }

    pub fn press(&mut self, visible: bool) {
        self.cancel();
        self.pressed_open = Some(visible);
    }

    pub fn release(&mut self, visible: bool) -> bool {
        let close = self.pressed_open.unwrap_or(visible);
        self.cancel();
        close
    }

    pub fn leave(&mut self) -> bool {
        let pressed = self.pressed_open.is_some();
        if pressed {
            self.cancel();
        }
        pressed
    }
}

#[derive(Debug, PartialEq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Keep the lower-right corner fixed as content changes. The work area is in
/// physical pixels; requested size and edge padding are in logical pixels.
pub fn bottom_right(
    origin: (i32, i32),
    area: (u32, u32),
    logical_size: (u32, u32),
    scale: f64,
) -> Placement {
    let gap = (EDGE_GAP * scale).round().max(1.0) as u32;
    let axis = |origin: i32, available: u32, requested: u32| {
        let inset = gap.min(available.saturating_sub(1) / 2);
        let size = ((requested as f64 * scale).round() as u32)
            .clamp(1, available.saturating_sub(2 * inset).max(1));
        let offset = available.saturating_sub(inset).saturating_sub(size);
        let position = (origin as i64 + offset as i64)
            .clamp(i32::MIN as i64, i32::MAX as i64) as i32;
        (position, size)
    };
    let (x, width) = axis(origin.0, area.0, logical_size.0);
    let (y, height) = axis(origin.1, area.1, logical_size.1);
    Placement { x, y, width, height }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_click_toggles_and_cancels_earlier_blur() {
        let mut state = Interaction::default();
        let blur = state.blur();
        state.press(true);
        assert!(!state.should_dismiss(blur));
        assert!(state.release(false));
        state.press(false);
        assert!(!state.release(false));
    }

    #[test]
    fn outside_blur_still_dismisses_but_refocus_cancels_it() {
        let mut state = Interaction::default();
        let blur = state.blur();
        assert!(state.should_dismiss(blur));
        state.refocus();
        assert!(!state.should_dismiss(blur));
    }

    #[test]
    fn direct_release_uses_current_visibility() {
        let mut state = Interaction::default();
        assert!(state.release(true));
        assert!(!state.release(false));
    }

    #[test]
    fn double_click_finishes_open() {
        let mut state = Interaction::default();
        state.press(false);
        assert!(!state.release(false));
        // Windows reports DoubleClick instead of the second mouse-down.
        state.press(false);
        assert!(!state.release(true));
    }

    #[test]
    fn delayed_refocus_does_not_change_the_pending_click() {
        let mut state = Interaction::default();
        state.press(false);
        let blur = state.blur();
        // Focus from the first click may arrive during the second tray press.
        state.refocus();
        assert!(!state.should_dismiss(blur));
        assert!(!state.release(true));
        // The same race must preserve a click that was intended to close.
        state.press(true);
        state.refocus();
        assert!(state.release(false));
    }

    #[test]
    fn dragging_off_the_tray_clears_the_pending_press() {
        let mut state = Interaction::default();
        state.press(true);
        assert!(state.leave());
        let blur = state.blur();
        assert!(state.should_dismiss(blur));
        assert!(!state.leave());
    }

    #[test]
    fn ordinary_tray_leave_keeps_outside_dismissal_pending() {
        let mut state = Interaction::default();
        let blur = state.blur();
        assert!(!state.leave());
        assert!(state.should_dismiss(blur));
    }

    #[test]
    fn a_slide_starts_and_lands_exactly_on_its_endpoints() {
        assert_eq!(slide(SLIDE, 0.0, 0, OPEN_MS), SLIDE);
        assert_eq!(slide(SLIDE, 0.0, OPEN_MS, OPEN_MS), 0.0);
        assert_eq!(slide(SLIDE, 0.0, OPEN_MS * 3, OPEN_MS), 0.0);
        assert_eq!(slide(0.0, SLIDE, 0, CLOSE_MS), 0.0);
        assert_eq!(slide(0.0, SLIDE, CLOSE_MS, CLOSE_MS), SLIDE);
        // Reduced motion asks for no travel time at all.
        assert_eq!(slide(SLIDE, 0.0, 0, 0), 0.0);
    }

    #[test]
    fn opening_decelerates_while_closing_accelerates() {
        let open = slide(SLIDE, 0.0, OPEN_MS / 2, OPEN_MS);
        assert!(open < SLIDE / 2.0, "opening should cover most ground early: {open}");
        let close = slide(0.0, SLIDE, CLOSE_MS / 2, CLOSE_MS);
        assert!(close < SLIDE / 2.0, "closing should start slowly: {close}");
        let mut previous = f64::MAX;
        for step in 0..=10 {
            let offset = slide(SLIDE, 0.0, OPEN_MS * step / 10, OPEN_MS);
            assert!(offset <= previous, "an opening slide never moves backwards");
            previous = offset;
        }
    }

    #[test]
    fn a_reversed_slide_only_covers_the_distance_left() {
        assert_eq!(slide_duration(SLIDE, 0.0, OPEN_MS), OPEN_MS);
        assert!(slide_duration(SLIDE / 4.0, 0.0, OPEN_MS) < OPEN_MS);
        assert_eq!(slide_duration(0.0, 0.0, OPEN_MS), 0);
        // A sliver of travel still animates rather than snapping.
        assert_eq!(slide_duration(0.5, 0.0, OPEN_MS), SHORTEST_MS);
    }

    #[test]
    fn slide_offsets_scale_with_monitor_dpi() {
        assert_eq!(shift(SLIDE, 1.0), 32);
        assert_eq!(shift(SLIDE, 1.5), 48);
        assert_eq!(shift(0.0, 2.0), 0);
    }

    #[test]
    fn a_hidden_popup_opens_from_the_full_travel_and_lands_level() {
        let mut motion = Motion::default();
        let (generation, duration) = motion.begin(false, false);
        assert_eq!(duration, OPEN_MS);
        assert_eq!(motion.offset(), SLIDE);
        assert!(!motion.closing());
        assert!(motion.advance(generation, 4.0));
        assert_eq!(motion.offset(), 4.0);
    }

    #[test]
    fn an_open_popup_reopened_from_the_tray_does_not_replay_the_slide() {
        let mut motion = Motion::default();
        assert_eq!(motion.begin(false, true).1, 0);
        assert_eq!(motion.offset(), 0.0);
    }

    #[test]
    fn reopening_mid_close_reverses_from_where_the_popup_stands() {
        let mut motion = Motion::default();
        let (closing, _) = motion.begin(true, true);
        assert!(motion.closing());
        motion.advance(closing, SLIDE / 2.0);
        let (_, duration) = motion.begin(false, true);
        assert!(!motion.closing());
        assert_eq!(motion.offset(), SLIDE / 2.0);
        assert_eq!(duration, OPEN_MS / 2);
        // The replaced close can no longer move or hide the popup.
        assert!(!motion.advance(closing, SLIDE));
        assert!(!motion.settle(closing));
    }

    #[test]
    fn a_finished_close_settles_level_so_the_next_open_starts_clean() {
        let mut motion = Motion::default();
        let (generation, duration) = motion.begin(true, true);
        assert_eq!(duration, CLOSE_MS);
        motion.advance(generation, SLIDE);
        assert!(motion.settle(generation));
        assert_eq!(motion.offset(), 0.0);
        assert!(!motion.closing());
    }

    #[test]
    fn reduced_motion_skips_the_slide_in_both_directions() {
        let mut motion = Motion::default();
        motion.set_reduced(true);
        let (_, open) = motion.begin(false, false);
        assert_eq!((open, motion.offset()), (0, 0.0));
        let (generation, close) = motion.begin(true, true);
        assert_eq!(close, 0);
        assert!(motion.closing());
        assert!(motion.settle(generation));
        assert_eq!(motion.offset(), 0.0);
    }

    #[test]
    fn bottom_right_uses_work_area_and_scaled_padding() {
        assert_eq!(
            bottom_right((0, 0), (1920, 1040), (440, 320), 1.5),
            Placement { x: 1242, y: 542, width: 660, height: 480 },
        );
    }

    #[test]
    fn resizing_preserves_the_bottom_and_right_edges() {
        let small = bottom_right((80, 40), (1840, 1040), (440, 320), 1.25);
        let large = bottom_right((80, 40), (1840, 1040), (600, 640), 1.25);
        assert_eq!(small.x + small.width as i32, 1905);
        assert_eq!(small.y + small.height as i32, 1065);
        assert_eq!(small.x + small.width as i32, large.x + large.width as i32);
        assert_eq!(small.y + small.height as i32, large.y + large.height as i32);
    }

    #[test]
    fn oversized_popup_fits_negative_origin_monitor() {
        assert_eq!(
            bottom_right((-1280, -720), (1280, 720), (2000, 1000), 1.0),
            Placement { x: -1268, y: -708, width: 1256, height: 696 },
        );
    }

    #[test]
    fn changing_dpi_preserves_logical_size_and_padding() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let placement = bottom_right((0, 0), (2560, 1440), (440, 320), scale);
            assert_eq!(placement.width, (440.0 * scale) as u32);
            assert_eq!(placement.height, (320.0 * scale) as u32);
            assert_eq!(2560 - placement.x - placement.width as i32, (12.0 * scale) as i32);
            assert_eq!(1440 - placement.y - placement.height as i32, (12.0 * scale) as i32);
        }
    }

    #[test]
    fn tiny_work_area_does_not_panic() {
        assert_eq!(
            bottom_right((0, 0), (10, 10), (440, 630), 2.0),
            Placement { x: 4, y: 4, width: 2, height: 2 },
        );
    }
}
