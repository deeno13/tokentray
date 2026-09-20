//! Window placement and click ordering, independent of Windows handles.

pub const INITIAL_SIZE: (u32, u32) = (400, 320);
const EDGE_GAP: f64 = 12.0;

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
