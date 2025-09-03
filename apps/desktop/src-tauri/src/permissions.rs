use cocoa::base::{id, nil};
use cocoa::foundation::{NSString, NSAutoreleasePool};
use objc::runtime::{Class, Object};
use objc::{msg_send, sel, sel_impl};
use std::ffi::CString;
use std::os::raw::c_char;

// AVAudioSession authorization status constants
const AV_AUDIO_SESSION_RECORD_PERMISSION_UNDETERMINED: i32 = 1970168948; // 'undt' 
const AV_AUDIO_SESSION_RECORD_PERMISSION_DENIED: i32 = 1684369017; // 'deny'
const AV_AUDIO_SESSION_RECORD_PERMISSION_GRANTED: i32 = 1735552628; // 'gran'

pub fn check_microphone_permission() -> Result<String, String> {
    unsafe {
        let _pool = NSAutoreleasePool::new(nil);
        
        // Get AVAudioSession class
        let av_audio_session_class = Class::get("AVAudioSession")
            .ok_or("AVAudioSession class not found")?;
        
        // Get shared instance
        let shared_instance: id = msg_send![av_audio_session_class, sharedInstance];
        if shared_instance == nil {
            return Err("Failed to get AVAudioSession shared instance".to_string());
        }
        
        // Get record permission status
        let permission_status: i32 = msg_send![shared_instance, recordPermission];
        
        match permission_status {
            AV_AUDIO_SESSION_RECORD_PERMISSION_GRANTED => Ok("granted".to_string()),
            AV_AUDIO_SESSION_RECORD_PERMISSION_DENIED => Ok("denied".to_string()),
            AV_AUDIO_SESSION_RECORD_PERMISSION_UNDETERMINED => Ok("undetermined".to_string()),
            _ => Ok("unknown".to_string()),
        }
    }
}

pub async fn request_microphone_permission() -> Result<bool, String> {
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;
    
    let (tx, rx) = mpsc::channel();
    
    // We need to run this on the main thread for macOS
    thread::spawn(move || {
        unsafe {
            let _pool = NSAutoreleasePool::new(nil);
            
            // Get AVAudioSession class
            let av_audio_session_class = match Class::get("AVAudioSession") {
                Some(class) => class,
                None => {
                    let _ = tx.send(Err("AVAudioSession class not found".to_string()));
                    return;
                }
            };
            
            // Get shared instance
            let shared_instance: id = msg_send![av_audio_session_class, sharedInstance];
            if shared_instance == nil {
                let _ = tx.send(Err("Failed to get AVAudioSession shared instance".to_string()));
                return;
            }
            
            // Create completion handler block
            let tx_clone = tx.clone();
            let completion_block = move |granted: bool| {
                let _ = tx_clone.send(Ok(granted));
            };
            
            // This is a simplified version - in reality we'd need to create a proper Objective-C block
            // For now, we'll just request permission synchronously and check the result
            let _: () = msg_send![shared_instance, requestRecordPermission: completion_block];
            
            // Wait a bit and then check the permission status
            thread::sleep(Duration::from_millis(100));
            
            let permission_status: i32 = msg_send![shared_instance, recordPermission];
            let granted = permission_status == AV_AUDIO_SESSION_RECORD_PERMISSION_GRANTED;
            let _ = tx.send(Ok(granted));
        }
    });
    
    // Wait for the result with a timeout
    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(result) => result,
        Err(_) => Err("Permission request timed out".to_string()),
    }
}

// Alternative simpler approach using NSAlert for user notification
pub fn show_permission_dialog() -> Result<(), String> {
    unsafe {
        let _pool = NSAutoreleasePool::new(nil);
        
        let ns_alert_class = Class::get("NSAlert")
            .ok_or("NSAlert class not found")?;
        
        let alert: id = msg_send![ns_alert_class, new];
        if alert == nil {
            return Err("Failed to create NSAlert".to_string());
        }
        
        let message_text = NSString::alloc(nil)
            .init_str("Microphone Permission Required");
        let informative_text = NSString::alloc(nil)
            .init_str("Oatmeal needs microphone access to transcribe your meetings. Please grant permission in System Preferences > Security & Privacy > Microphone.");
        
        let _: () = msg_send![alert, setMessageText: message_text];
        let _: () = msg_send![alert, setInformativeText: informative_text];
        let _: () = msg_send![alert, addButtonWithTitle: NSString::alloc(nil).init_str("OK")];
        
        // Run the alert
        let _response: i32 = msg_send![alert, runModal];
        
        Ok(())
    }
}