//! Window placement and click ordering, independent of Windows handles.
#[derive(Default)]
pub struct Interaction { generation: u64, pressed_open: Option<bool> }
impl Interaction {
    pub fn cancel(&mut self) { self.generation=self.generation.wrapping_add(1); self.pressed_open=None; }
    pub fn blur(&mut self) -> u64 { self.generation=self.generation.wrapping_add(1); self.generation }
    pub fn should_dismiss(&self, generation: u64) -> bool { self.generation==generation && self.pressed_open.is_none() }
    pub fn press(&mut self, visible: bool) { self.cancel(); self.pressed_open=Some(visible); }
    pub fn release(&mut self, visible: bool) -> bool { let close=self.pressed_open.unwrap_or(visible);self.cancel();close }
    pub fn is_pressed(&self) -> bool { self.pressed_open.is_some() }
}
#[derive(Debug, PartialEq)]
pub struct Placement {pub x:i32,pub y:i32,pub width:u32,pub height:u32}
pub fn fit(origin:(i32,i32), area:(u32,u32), desired:(i32,i32), size:(u32,u32), scale:f64) -> Placement {
    let gap=(12.0*scale).round().max(1.0) as u32;
    let gx=gap.min(area.0.saturating_sub(1)/2);let gy=gap.min(area.1.saturating_sub(1)/2);
    let width=size.0.min(area.0.saturating_sub(2*gx)).max(1);let height=size.1.min(area.1.saturating_sub(2*gy)).max(1);
    let left=origin.0+gx as i32;let top=origin.1+gy as i32;
    Placement{x:desired.0.clamp(left,left+(area.0.saturating_sub(2*gx+width)) as i32),y:desired.1.clamp(top,top+(area.1.saturating_sub(2*gy+height)) as i32),width,height}
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn tray_click_toggles_and_cancels_earlier_blur(){let mut s=Interaction::default();let blur=s.blur();s.press(true);assert!(!s.should_dismiss(blur));assert!(s.release(false));s.press(false);assert!(!s.release(false));}
    #[test] fn outside_blur_still_dismisses_but_refocus_cancels_it(){let mut s=Interaction::default();let blur=s.blur();assert!(s.should_dismiss(blur));s.cancel();assert!(!s.should_dismiss(blur));}
    #[test] fn direct_release_uses_current_visibility(){let mut s=Interaction::default();assert!(s.release(true));assert!(!s.release(false));}
    #[test] fn keeps_scaled_gap_from_taskbar_and_screen_edges(){let p=fit((0,0),(1920,1040),(1900,1030),(440,630),1.5);assert_eq!(p,Placement{x:1462,y:392,width:440,height:630});}
    #[test] fn oversized_popup_fits_negative_origin_monitor(){let p=fit((-1280,0),(1280,720),(-2000,-200),(2000,1000),1.0);assert_eq!(p,Placement{x:-1268,y:12,width:1256,height:696});}
    #[test] fn tiny_work_area_does_not_panic(){assert_eq!(fit((0,0),(10,10),(999,999),(440,630),2.0),Placement{x:4,y:4,width:2,height:2});}
}
