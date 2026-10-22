// MyChess.app's executable: a tiny background app that runs Resources/launch.sh.
// It has to be a compiled app, not a bare shell script: macOS then asks once for
// access to the folder MyChess lives in (when it is protected, such as the Desktop) and attributes the server to
// MyChess. As a script, bash was the "app", macOS refused without asking, and the
// server never started. The app stays open while the server it started runs, so
// the permission keeps covering it, and it quits when the server stops.
#import <Cocoa/Cocoa.h>

@interface Launcher : NSObject <NSApplicationDelegate>
@property NSInteger running;
@end

@implementation Launcher
- (void)runScript {
    NSTask *task = [NSTask new];
    task.executableURL = [NSURL fileURLWithPath:@"/bin/bash"];
    task.arguments = @[[[NSBundle mainBundle] pathForResource:@"launch" ofType:@"sh"]];
    task.terminationHandler = ^(NSTask *t) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (--self.running <= 0) [NSApp terminate:nil];
        });
    };
    if ([task launchAndReturnError:nil]) self.running++;
    else if (self.running == 0) [NSApp terminate:nil];
}

- (void)applicationDidFinishLaunching:(NSNotification *)note {
    [self runScript];
}

// Opening MyChess again while it is still running: open another window.
- (BOOL)applicationShouldHandleReopen:(NSApplication *)app hasVisibleWindows:(BOOL)visible {
    [self runScript];
    return NO;
}
@end

int main(void) {
    @autoreleasepool {
        Launcher *launcher = [Launcher new];
        NSApplication.sharedApplication.delegate = launcher;
        [NSApp run];
    }
    return 0;
}
