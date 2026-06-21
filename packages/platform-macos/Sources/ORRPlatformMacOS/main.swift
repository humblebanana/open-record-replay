import AppKit
import ApplicationServices
import Foundation

struct AppInfo: Codable {
    let name: String?
    let bundleIdentifier: String?
    let processIdentifier: pid_t
}

struct Snapshot: Codable {
    let schema_version: Int
    let kind: String
    let timestamp: String
    let activeApp: AppInfo?
    let accessibilityTrusted: Bool
    let inputMonitoringTrusted: Bool
}

struct PermissionStatus: Codable {
    let schema_version: Int
    let kind: String
    let timestamp: String
    let accessibilityTrusted: Bool
    let inputMonitoringTrusted: Bool
    let recorderReady: Bool
    let missing: [String]
    let instructions: [String]
}

struct MouseContext {
    let point: CGPoint
    let button: String
    let target: [String: Any]
    let app: [String: Any]
    let window: [String: Any]
    let ax: [String: Any]?
    let timestamp: String
}

struct KeyboardContext {
    let app: [String: Any]
    let window: [String: Any]
    let target: [String: Any]
    let timestamp: String
}

final class RecordingHUDDragHandle: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        build()
    }

    private func build() {
        wantsLayer = true
        layer?.backgroundColor = NSColor(calibratedWhite: 0.12, alpha: 0.95).cgColor
        layer?.cornerRadius = 17

        let icon = NSTextField(labelWithString: "≡")
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.textColor = NSColor.white.withAlphaComponent(0.55)
        icon.font = NSFont.systemFont(ofSize: 22, weight: .semibold)
        icon.alignment = .center
        addSubview(icon)
        NSLayoutConstraint.activate([
            icon.centerXAnchor.constraint(equalTo: centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -1)
        ])
    }

    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }
}

final class RecordingHUD: NSObject {
    weak var recorder: NativeRecorder?
    let panel: NSPanel
    let timerLabel = NSTextField(labelWithString: "00:00")
    let statusLabel = NSTextField(labelWithString: "Recording")
    let hintLabel = NSTextField(labelWithString: "Open Record/Replay")
    let statusDot = NSView()
    let pauseButton = NSButton(title: "Pause", target: nil, action: nil)
    let stopButton = NSButton(title: "■", target: nil, action: nil)
    let startedAt = Date()
    var timer: Timer?
    var paused = false
    var controlsLaidOut = false
    var pauseStartedAt: Date?
    var totalPausedSeconds: TimeInterval = 0

    init(recorder: NativeRecorder) {
        self.recorder = recorder
        self.panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 430, height: 58),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        super.init()
        build()
    }

    func show() {
        guard let screen = NSScreen.main else { return }
        let frame = screen.visibleFrame
        panel.setFrameOrigin(NSPoint(x: frame.midX - panel.frame.width / 2, y: frame.minY + 110))
        panel.orderFrontRegardless()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.updateTimer()
        }
    }

    func close() {
        timer?.invalidate()
        panel.orderOut(nil)
    }

    private func build() {
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.ignoresMouseEvents = false

        let root = NSView(frame: panel.contentView?.bounds ?? NSRect(x: 0, y: 0, width: 430, height: 58))
        root.autoresizingMask = [.width, .height]
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor(calibratedWhite: 1, alpha: 0.96).cgColor
        root.layer?.cornerRadius = 29
        root.layer?.masksToBounds = true
        root.layer?.borderWidth = 1
        root.layer?.borderColor = NSColor.black.withAlphaComponent(0.06).cgColor

        let stack = NSStackView(frame: root.bounds)
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.distribution = .fill
        stack.spacing = 10
        stack.autoresizingMask = [.width, .height]
        stack.edgeInsets = NSEdgeInsets(top: 0, left: 18, bottom: 0, right: 10)

        statusDot.wantsLayer = true
        statusDot.layer?.backgroundColor = NSColor.systemRed.cgColor
        statusDot.layer?.cornerRadius = 5
        statusDot.widthAnchor.constraint(equalToConstant: 9).isActive = true
        statusDot.heightAnchor.constraint(equalToConstant: 9).isActive = true

        statusLabel.textColor = NSColor(calibratedWhite: 0.15, alpha: 1)
        statusLabel.font = NSFont.systemFont(ofSize: 17, weight: .semibold)
        statusLabel.widthAnchor.constraint(equalToConstant: 82).isActive = true

        hintLabel.textColor = NSColor(calibratedWhite: 0.55, alpha: 1)
        hintLabel.font = NSFont.systemFont(ofSize: 15, weight: .regular)
        hintLabel.lineBreakMode = .byTruncatingTail

        timerLabel.textColor = NSColor(calibratedWhite: 0.46, alpha: 1)
        timerLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 15, weight: .semibold)
        timerLabel.alignment = .right
        timerLabel.widthAnchor.constraint(equalToConstant: 50).isActive = true

        stylePauseButton(paused: false)
        styleStopButton()
        let dragHandle = RecordingHUDDragHandle(frame: NSRect(x: 0, y: 0, width: 34, height: 44))
        dragHandle.widthAnchor.constraint(equalToConstant: 34).isActive = true
        dragHandle.heightAnchor.constraint(equalToConstant: 44).isActive = true

        stack.addArrangedSubview(statusDot)
        stack.addArrangedSubview(statusLabel)
        stack.addArrangedSubview(hintLabel)
        stack.addArrangedSubview(timerLabel)
        stack.addArrangedSubview(pauseButton)
        stack.addArrangedSubview(stopButton)
        stack.addArrangedSubview(dragHandle)
        root.addSubview(stack)
        panel.contentView = root
    }

    private func stylePauseButton(paused: Bool) {
        pauseButton.title = paused ? "Resume" : "Pause"
        pauseButton.target = self
        pauseButton.action = #selector(togglePause)
        pauseButton.isBordered = false
        pauseButton.bezelStyle = .regularSquare
        pauseButton.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        pauseButton.contentTintColor = paused ? NSColor.systemOrange : NSColor(calibratedWhite: 0.16, alpha: 1)
        pauseButton.setButtonType(.momentaryChange)
        pauseButton.wantsLayer = true
        pauseButton.layer?.backgroundColor = (paused ? NSColor.systemOrange.withAlphaComponent(0.12) : NSColor.black.withAlphaComponent(0.06)).cgColor
        pauseButton.layer?.cornerRadius = 18
        if !controlsLaidOut {
            pauseButton.widthAnchor.constraint(equalToConstant: 72).isActive = true
            pauseButton.heightAnchor.constraint(equalToConstant: 36).isActive = true
        }
    }

    private func styleStopButton() {
        stopButton.title = "■"
        stopButton.target = self
        stopButton.action = #selector(stopRecording)
        stopButton.isBordered = false
        stopButton.bezelStyle = .regularSquare
        stopButton.contentTintColor = NSColor.white
        stopButton.font = NSFont.systemFont(ofSize: 14, weight: .bold)
        stopButton.setButtonType(.momentaryChange)
        stopButton.wantsLayer = true
        stopButton.layer?.backgroundColor = NSColor.black.cgColor
        stopButton.layer?.cornerRadius = 20
        if !controlsLaidOut {
            stopButton.widthAnchor.constraint(equalToConstant: 40).isActive = true
            stopButton.heightAnchor.constraint(equalToConstant: 40).isActive = true
            controlsLaidOut = true
        }
    }

    private func updateTimer() {
        let now = Date()
        let currentPause = paused ? now.timeIntervalSince(pauseStartedAt ?? now) : 0
        let seconds = max(0, Int(now.timeIntervalSince(startedAt) - totalPausedSeconds - currentPause))
        timerLabel.stringValue = "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }

    func setPaused(_ paused: Bool) {
        if paused && !self.paused {
            pauseStartedAt = Date()
        }
        if !paused && self.paused, let pauseStartedAt {
            totalPausedSeconds += Date().timeIntervalSince(pauseStartedAt)
            self.pauseStartedAt = nil
        }
        self.paused = paused
        statusLabel.stringValue = paused ? "Paused" : "Recording"
        hintLabel.stringValue = paused ? "Capture is paused" : "Open Record/Replay"
        statusDot.layer?.backgroundColor = (paused ? NSColor.systemOrange : NSColor.systemRed).cgColor
        timerLabel.textColor = paused ? NSColor.systemOrange : NSColor(calibratedWhite: 0.46, alpha: 1)
        stylePauseButton(paused: paused)
    }

    @objc private func togglePause() {
        if paused {
            recorder?.resumeFromHUD()
        } else {
            recorder?.pauseFromHUD()
        }
    }

    @objc private func stopRecording() {
        recorder?.stopFromHUD()
    }
}

final class NativeRecorder {
    let sessionPath: String
    let eventsPath: String
    let manifestPath: String?
    var hud: RecordingHUD?
    var nextId: Int
    var stopped = false
    var paused = false
    var previousWindowKey = ""
    var previousWindowSemanticKey = ""
    var previousWindowIdentity = ""
    var previousWindowTree = ""
    var lastWindowCapturedAt: Date?
    var previousSelectionKey = ""
    var lastSelectionCapturedAt: Date?
    var mouseDown: MouseContext?
    var keyboardBuffer = ""
    var keyboardBufferContext: KeyboardContext?
    var keyboardBufferLastInputAt: Date?
    var lastClickKey = ""
    var lastClickAt: Date?
    var eventTap: CFMachPort?

    init(sessionPath: String, eventsPath: String, manifestPath: String?) {
        self.sessionPath = sessionPath
        self.eventsPath = eventsPath
        self.manifestPath = manifestPath
        self.nextId = NativeRecorder.nextEventId(eventsPath: eventsPath)
    }

    func run() {
        NSApplication.shared.setActivationPolicy(.accessory)
        hud = RecordingHUD(recorder: self)
        hud?.show()

        signal(SIGTERM, SIG_IGN)
        signal(SIGINT, SIG_IGN)

        let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        sigterm.setEventHandler { [weak self] in self?.finish(endReason: "recording_controls_stopped", status: "completed", stopSource: "signal") }
        sigterm.resume()

        let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        sigint.setEventHandler { [weak self] in self?.finish(endReason: "recording_controls_stopped", status: "completed", stopSource: "signal") }
        sigint.resume()

        append([
            "kind": "recorder.started",
            "timestamp": isoNow(),
            "recorder": [
                "kind": "native-macos-recorder",
                "captures": ["ax_full_tree", "mouse", "keyboard", "selection"]
            ],
            "permissions": [
                "accessibilityTrusted": AXIsProcessTrusted()
            ]
        ])

        if !AXIsProcessTrusted() {
            append([
                "kind": "recorder.observation_failed",
                "timestamp": isoNow(),
                "observation": ["source": "accessibility"],
                "error": "Accessibility permission is not trusted for this process."
            ])
        }

        installEventTap()
        captureWindowIfChanged(force: true)
        pollSelectionIfChanged()

        Timer.scheduledTimer(withTimeInterval: 0.75, repeats: true) { [weak self] timer in
            guard let self else { return }
            if self.stopped {
                timer.invalidate()
                return
            }
            if self.paused { return }
            self.flushKeyboardBufferIfIdle()
            self.captureWindowIfChanged(force: false)
            self.pollSelectionIfChanged()
        }

        NSApplication.shared.run()
    }

    func stop() {
        finish(endReason: "recording_controls_stopped", status: "completed", stopSource: "api")
    }

    func stopFromHUD() {
        append([
            "kind": "recording_control.stop_clicked",
            "timestamp": isoNow(),
            "recorder": ["kind": "native-macos-recorder", "source": "hud"]
        ])
        finish(endReason: "recording_controls_stopped", status: "completed", stopSource: "hud")
    }

    func pauseFromHUD() {
        if stopped || paused { return }
        flushKeyboardBuffer()
        paused = true
        mouseDown = nil
        hud?.setPaused(true)
        append([
            "kind": "recording_control.pause_clicked",
            "timestamp": isoNow(),
            "recorder": ["kind": "native-macos-recorder", "source": "hud"]
        ])
        append([
            "kind": "recorder.paused",
            "timestamp": isoNow(),
            "recorder": ["kind": "native-macos-recorder", "source": "hud"]
        ])
    }

    func resumeFromHUD() {
        if stopped || !paused { return }
        paused = false
        previousWindowKey = ""
        previousWindowSemanticKey = ""
        previousWindowIdentity = ""
        previousWindowTree = ""
        previousSelectionKey = ""
        hud?.setPaused(false)
        append([
            "kind": "recording_control.resume_clicked",
            "timestamp": isoNow(),
            "recorder": ["kind": "native-macos-recorder", "source": "hud"]
        ])
        append([
            "kind": "recorder.resumed",
            "timestamp": isoNow(),
            "recorder": ["kind": "native-macos-recorder", "source": "hud"]
        ])
        captureWindowIfChanged(force: true)
        pollSelectionIfChanged(force: true)
    }

    func finish(endReason: String, status: String, stopSource: String) {
        if stopped { return }
        stopped = true
        flushKeyboardBuffer()
        hud?.close()
        if let eventTap {
            CGEvent.tapEnable(tap: eventTap, enable: false)
        }
        append([
            "kind": "recorder.stopped",
            "timestamp": isoNow(),
            "recorder": ["kind": "native-macos-recorder", "stop_source": stopSource]
        ])
        let endedAt = isoNow()
        append([
            "id": nextId,
            "kind": "session.ended",
            "timestamp": endedAt
        ])
        updateSessionFiles(endedAt: endedAt, endReason: endReason, status: status)
        writeManifest()
        exit(0)
    }

    func installEventTap() {
        let mask =
            (1 << CGEventType.leftMouseDown.rawValue) |
            (1 << CGEventType.leftMouseUp.rawValue) |
            (1 << CGEventType.leftMouseDragged.rawValue) |
            (1 << CGEventType.rightMouseDown.rawValue) |
            (1 << CGEventType.rightMouseUp.rawValue) |
            (1 << CGEventType.rightMouseDragged.rawValue) |
            (1 << CGEventType.keyDown.rawValue)

        let userInfo = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        eventTap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: CGEventMask(mask),
            callback: eventTapCallback,
            userInfo: userInfo
        )

        guard let eventTap else {
            append([
                "kind": "recorder.observation_failed",
                "timestamp": isoNow(),
                "observation": ["source": "cg_event_tap"],
                "error": "Unable to create CGEvent tap. Grant Input Monitoring/Accessibility permissions."
            ])
            return
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: eventTap, enable: true)
    }

    func handleEvent(type: CGEventType, event: CGEvent) {
        if paused {
            switch type {
            case .tapDisabledByTimeout, .tapDisabledByUserInput:
                if let eventTap {
                    CGEvent.tapEnable(tap: eventTap, enable: true)
                }
            default:
                break
            }
            return
        }

        switch type {
        case .leftMouseDown:
            mouseDown = mouseContext(event: event, button: "left")
        case .rightMouseDown:
            mouseDown = mouseContext(event: event, button: "right")
        case .leftMouseUp, .rightMouseUp:
            let button = type == .leftMouseUp ? "left" : "right"
            handleMouseUp(event: event, button: button)
        case .leftMouseDragged, .rightMouseDragged:
            handleMouseDragged(event: event, button: type == .leftMouseDragged ? "left" : "right")
        case .keyDown:
            handleKeyDown(event: event)
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let eventTap {
                CGEvent.tapEnable(tap: eventTap, enable: true)
            }
        default:
            break
        }
    }

    func handleMouseUp(event: CGEvent, button: String) {
        flushKeyboardBuffer()
        let context = mouseContext(event: event, button: button)
        if isOwnProcess(app: context.app) { return }
        let start = mouseDown
        mouseDown = nil
        if let start, distance(start.point, context.point) > 8 {
            var event: [String: Any] = [
                "kind": "mouse.drag",
                "timestamp": context.timestamp,
                "app": context.app,
                "window": context.window,
                "mouse": [
                    "button": button,
                    "clickCount": 0,
                    "from": ["x": start.point.x, "y": start.point.y],
                    "to": ["x": context.point.x, "y": context.point.y],
                    "target": context.target,
                    "origin": actionPoint(context: start),
                    "destination": actionPoint(context: context)
                ]
            ]
            attachActionAX(to: &event, app: context.app)
            append(event)
            schedulePostActionObservation()
            return
        }

        let clickContext = bestClickContext(start: start, end: context)
        let clickKey = mouseClickKey(context: clickContext)
        if let lastClickAt,
           lastClickKey == clickKey,
           Date().timeIntervalSince(lastClickAt) < 0.25 {
            return
        }
        lastClickKey = clickKey
        lastClickAt = Date()

        let preferredPressAX = preferredPressAXForClick(start: start)
        let releaseTarget = start.flatMap { targetsDiffer($0.target, context.target) ? context.target : nil }
        var mouse: [String: Any] = [
            "button": button,
            "clickCount": event.getIntegerValueField(.mouseEventClickState),
            "location": ["x": context.point.x, "y": context.point.y],
            "target": normalizedClickTarget(clickContext.target, ax: preferredPressAX, releaseTarget: releaseTarget)
        ]
        if let start, targetsDiffer(start.target, context.target) {
            mouse["press_target"] = normalizedClickTarget(start.target, ax: start.ax, releaseTarget: context.target)
            mouse["release_target"] = normalizedClickTarget(context.target, ax: context.ax, releaseTarget: nil)
        }

        var event: [String: Any] = [
            "kind": "mouse.click",
            "timestamp": context.timestamp,
            "app": clickContext.app,
            "window": clickContext.window,
            "mouse": mouse
        ]
        if let preferredPressAX {
            event["ax"] = preferredPressAX
        } else {
            attachActionAX(to: &event, app: clickContext.app)
        }
        append(event)
        schedulePostActionObservation()
        pollSelectionIfChanged(force: true)
    }

    func handleMouseDragged(event: CGEvent, button: String) {
        if mouseDown == nil {
            let context = mouseContext(event: event, button: button)
            if isOwnProcess(app: context.app) { return }
            mouseDown = context
        }
    }

    func handleKeyDown(event: CGEvent) {
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let context = focusedContext()
        if keyCode == 36 || keyCode == 76 {
            flushKeyboardBuffer()
            var event: [String: Any] = [
                "kind": "keyboard.submit",
                "timestamp": isoNow(),
                "app": context.app,
                "window": context.window,
                "keyboard": [
                    "keyEquivalent": "return",
                    "target": context.target
                ]
            ]
            attachActionAX(to: &event, app: context.app)
            append(event)
            schedulePostActionObservation()
            return
        }

        if event.flags.contains(.maskCommand) || event.flags.contains(.maskControl) || event.flags.contains(.maskAlternate) {
            flushKeyboardBuffer()
            var shortcutEvent: [String: Any] = [
                "kind": "keyboard.shortcut",
                "timestamp": isoNow(),
                "app": context.app,
                "window": context.window,
                "keyboard": [
                    "keyEquivalent": shortcutString(event: event, keyCode: keyCode),
                    "target": context.target
                ]
            ]
            attachActionAX(to: &shortcutEvent, app: context.app)
            append(shortcutEvent)
            schedulePostActionObservation()
            return
        }

        let text = unicodeString(from: event)
        if text.isEmpty || text.trimmingCharacters(in: .controlCharacters).isEmpty { return }
        let keyboardContext = KeyboardContext(app: context.app, window: context.window, target: context.target, timestamp: isoNow())
        if let existing = keyboardBufferContext,
           stableJSONString(existing.app) == stableJSONString(keyboardContext.app),
           stableJSONString(existing.window) == stableJSONString(keyboardContext.window),
           stableJSONString(inputTargetIdentity(existing.target)) == stableJSONString(inputTargetIdentity(keyboardContext.target)) {
            keyboardBuffer += text
            keyboardBufferContext = keyboardContext
            keyboardBufferLastInputAt = Date()
            return
        }

        flushKeyboardBuffer()
        keyboardBuffer = text
        keyboardBufferContext = keyboardContext
        keyboardBufferLastInputAt = Date()
    }

    func flushKeyboardBufferIfIdle() {
        guard let lastInputAt = keyboardBufferLastInputAt else { return }
        if Date().timeIntervalSince(lastInputAt) >= 0.7 {
            flushKeyboardBuffer()
        }
    }

    func flushKeyboardBuffer() {
        guard !keyboardBuffer.isEmpty, let context = keyboardBufferContext else { return }
        append([
            "kind": "keyboard.text_input",
            "timestamp": context.timestamp,
            "app": context.app,
            "window": context.window,
            "keyboard": [
                "text": keyboardBuffer,
                "target": context.target
            ]
        ])
        keyboardBuffer = ""
        keyboardBufferContext = nil
        keyboardBufferLastInputAt = nil
    }

    func captureWindowIfChanged(force: Bool) {
        guard let active = NSWorkspace.shared.frontmostApplication else { return }
        if active.processIdentifier == getpid() { return }
        guard let snapshot = buildWindowAXSnapshot(active: active, fullTreeWhenNoDiff: false) else { return }
        if !force && snapshot.key == previousWindowKey { return }
        if !force && snapshot.semanticKey == previousWindowSemanticKey {
            return
        }
        if !force,
           let lastWindowCapturedAt,
           Date().timeIntervalSince(lastWindowCapturedAt) < 1.2,
           !isHighValueSemanticChange(previousWindowSemanticKey, snapshot.semanticKey) {
            return
        }
        commitWindowAXSnapshot(snapshot)
        append([
            "kind": "window.changed",
            "timestamp": isoNow(),
            "app": appDictionary(app: active),
            "window": snapshot.window,
            "ax": snapshot.ax
        ])
    }

    func buildWindowAXSnapshot(active: NSRunningApplication, fullTreeWhenNoDiff: Bool) -> (window: [String: Any], ax: [String: Any], key: String, semanticKey: String, identity: String, tree: String)? {
        let appElement = AXUIElementCreateApplication(active.processIdentifier)
        guard let window = focusedWindow(appElement: appElement) ?? firstWindow(appElement: appElement) else { return nil }
        let title = stringAttribute(window, kAXTitleAttribute) ?? ""
        let tree = AXTreeRenderer().render(root: window)
        let identity = "\(active.processIdentifier)|\(title)"
        let key = "\(identity)|\(tree.hashValue)"
        let semanticKey = stableJSONString([
            "pid": active.processIdentifier,
            "title": title,
            "signature": semanticSignature(from: tree)
        ])

        var mode = "fullTree"
        var text = tree
        if !previousWindowTree.isEmpty && previousWindowIdentity == identity {
            mode = "diffFromPrevious"
            text = axDiffText(previous: previousWindowTree, next: tree)
            if text.isEmpty && fullTreeWhenNoDiff {
                mode = "fullTree"
                text = tree
            }
        }
        if text.isEmpty {
            text = tree
        }

        return (
            window: windowDictionary(element: window),
            ax: [
                "mode": mode,
                "source": "macos-accessibility",
                "text": text
            ],
            key: key,
            semanticKey: semanticKey,
            identity: identity,
            tree: tree
        )
    }

    func commitWindowAXSnapshot(_ snapshot: (window: [String: Any], ax: [String: Any], key: String, semanticKey: String, identity: String, tree: String)) {
        previousWindowKey = snapshot.key
        previousWindowSemanticKey = snapshot.semanticKey
        previousWindowIdentity = snapshot.identity
        previousWindowTree = snapshot.tree
        lastWindowCapturedAt = Date()
    }

    func attachActionAX(to event: inout [String: Any], app appInfo: [String: Any]) {
        guard let active = runningApplication(for: appInfo) ?? NSWorkspace.shared.frontmostApplication else { return }
        if active.processIdentifier == getpid() { return }
        guard let snapshot = buildWindowAXSnapshot(active: active, fullTreeWhenNoDiff: true) else { return }
        event["window"] = snapshot.window
        event["ax"] = snapshot.ax
        commitWindowAXSnapshot(snapshot)
    }

    func actionAXSnapshot(app appInfo: [String: Any]) -> [String: Any]? {
        guard let active = runningApplication(for: appInfo) ?? NSWorkspace.shared.frontmostApplication else { return nil }
        if active.processIdentifier == getpid() { return nil }
        return buildWindowAXSnapshot(active: active, fullTreeWhenNoDiff: true)?.ax
    }

    func preferredPressAXForClick(start: MouseContext?) -> [String: Any]? {
        guard let ax = start?.ax,
              isTransientActionCluster(axText: ax["text"] as? String ?? "") else {
            return nil
        }
        var result = ax
        result["phase"] = "press"
        return result
    }

    func runningApplication(for appInfo: [String: Any]) -> NSRunningApplication? {
        if let pid = appInfo["pid"] as? pid_t {
            return NSRunningApplication(processIdentifier: pid)
        }
        if let pid = appInfo["pid"] as? Int {
            return NSRunningApplication(processIdentifier: pid_t(pid))
        }
        if let pid = appInfo["pid"] as? NSNumber {
            return NSRunningApplication(processIdentifier: pid.int32Value)
        }
        return nil
    }

    func schedulePostActionObservation() {
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(300)) { [weak self] in
            guard let self, !self.stopped, !self.paused else { return }
            self.captureWindowIfChanged(force: false)
            self.pollSelectionIfChanged()
        }
    }

    func pollSelectionIfChanged(force: Bool = false) {
        let selection = currentSelection()
        guard !selection.isEmpty else { return }
        let key = stableJSONString(selection)
        if !force && key == previousSelectionKey { return }
        if !force, let lastSelectionCapturedAt, Date().timeIntervalSince(lastSelectionCapturedAt) < 1.5 {
            return
        }
        previousSelectionKey = key
        lastSelectionCapturedAt = Date()
        var event: [String: Any] = [
            "kind": "selection.changed",
            "timestamp": isoNow()
        ]
        for (k, v) in selection {
            event[k] = v
        }
        append(event)
    }

    func currentSelection() -> [String: Any] {
        guard let active = NSWorkspace.shared.frontmostApplication else { return [:] }
        if active.processIdentifier == getpid() { return [:] }
        let appElement = AXUIElementCreateApplication(active.processIdentifier)
        let window = focusedWindow(appElement: appElement) ?? firstWindow(appElement: appElement)
        let focused = elementAttribute(appElement, kAXFocusedUIElementAttribute)
        var selectedItems: [[String: Any]] = []
        var target: [String: Any] = [:]

        if let focused {
            target = summarize(element: focused)
            selectedItems.append(contentsOf: selectedItemsFrom(element: focused))
        }
        if let window {
            selectedItems.append(contentsOf: selectedItemsInTree(root: window, maxNodes: 350))
            if target.isEmpty {
                target = summarize(element: window)
            }
        }

        let selectedText = focused.flatMap { stringAttribute($0, kAXSelectedTextAttribute) }
        let cleanedSelectedItems = cleanSelectedItems(selectedItems)
        if cleanedSelectedItems.isEmpty && (selectedText == nil || selectedText == "") { return [:] }

        var result: [String: Any] = [
            "app": appDictionary(app: active),
            "window": window.map { windowDictionary(element: $0) } ?? [:],
            "selection": ["target": target]
        ]
        var selection = result["selection"] as! [String: Any]
        if !cleanedSelectedItems.isEmpty {
            selection["selectedItems"] = cleanedSelectedItems
        }
        if let selectedText, !selectedText.isEmpty {
            selection["selectedText"] = selectedText
        }
        if let focused, let selectedRange = selectedTextRange(element: focused) {
            selection["selectedRange"] = selectedRange
        }
        result["selection"] = selection
        return result
    }

    func mouseContext(event: CGEvent, button: String) -> MouseContext {
        let point = event.location
        var targetElement: AXUIElement?
        AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(point.x), Float(point.y), &targetElement)

        var app: [String: Any] = [:]
        if let targetElement {
            var pid: pid_t = 0
            AXUIElementGetPid(targetElement, &pid)
            if let running = NSRunningApplication(processIdentifier: pid) {
                app = appDictionary(app: running)
            }
        }
        if app.isEmpty, let active = NSWorkspace.shared.frontmostApplication {
            app = appDictionary(app: active)
        }

        return MouseContext(
            point: point,
            button: button,
            target: targetElement.map { semanticTarget(element: $0, point: point) } ?? [:],
            app: app,
            window: currentWindowDictionary(app: app),
            ax: actionAXSnapshot(app: app),
            timestamp: isoNow()
        )
    }

    func focusedContext() -> (app: [String: Any], window: [String: Any], target: [String: Any]) {
        guard let active = NSWorkspace.shared.frontmostApplication else {
            return ([:], [:], [:])
        }
        let appElement = AXUIElementCreateApplication(active.processIdentifier)
        let focused = elementAttribute(appElement, kAXFocusedUIElementAttribute)
        return (
            appDictionary(app: active),
            currentWindowDictionary(app: appDictionary(app: active)),
            focused.map { semanticTarget(element: $0, point: nil) } ?? [:]
        )
    }

    func currentWindowDictionary(app appInfo: [String: Any]? = nil) -> [String: Any] {
        let active: NSRunningApplication?
        if let pid = appInfo?["pid"] as? pid_t {
            active = NSRunningApplication(processIdentifier: pid)
        } else {
            active = NSWorkspace.shared.frontmostApplication
        }
        guard let active else { return [:] }
        let appElement = AXUIElementCreateApplication(active.processIdentifier)
        let window = focusedWindow(appElement: appElement) ?? firstWindow(appElement: appElement)
        return window.map { windowDictionary(element: $0) } ?? [:]
    }

    func actionPoint(context: MouseContext) -> [String: Any] {
        [
            "app": context.app,
            "window": context.window,
            "location": ["x": context.point.x, "y": context.point.y],
            "element": context.target,
            "target": context.target
        ]
    }

    func bestClickContext(start: MouseContext?, end: MouseContext) -> MouseContext {
        guard let start else { return end }
        if targetQualityScore(start.target) > targetQualityScore(end.target) {
            return start
        }
        return end
    }

    func mouseClickKey(context: MouseContext) -> String {
        let x = Int((context.point.x / 3).rounded())
        let y = Int((context.point.y / 3).rounded())
        return stableJSONString([
            "button": context.button,
            "x": x,
            "y": y,
            "app": context.app["bundle_id"] ?? context.app["name"] ?? "",
            "target": compactTargetIdentity(context.target)
        ])
    }

    func append(_ event: [String: Any]) {
        var row = event
        row["id"] = nextId
        nextId += 1
        guard JSONSerialization.isValidJSONObject(row),
              let data = try? JSONSerialization.data(withJSONObject: row, options: []),
              let line = String(data: data, encoding: .utf8) else {
            return
        }
        if let handle = FileHandle(forWritingAtPath: eventsPath) {
            handle.seekToEndOfFile()
            handle.write((line + "\n").data(using: .utf8)!)
            try? handle.close()
        }
    }

    func writeManifest() {
        guard let manifestPath else { return }
        let count = NativeRecorder.nextEventId(eventsPath: eventsPath) - 1
        let payload: [String: Any] = [
            "schema_version": 1,
            "kind": "recording_manifest",
            "events_path": eventsPath,
            "event_count": count,
            "generated_at": isoNow(),
            "recorder": "native-macos-recorder"
        ]
        if JSONSerialization.isValidJSONObject(payload),
           let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) {
            try? data.write(to: URL(fileURLWithPath: manifestPath))
        }
    }

    func updateSessionFiles(endedAt: String, endReason: String, status: String) {
        let sessionURL = URL(fileURLWithPath: sessionPath)
        let sessionDirectory = sessionURL.deletingLastPathComponent()
        let metadataURL = sessionDirectory.appendingPathComponent("session.json")

        let existingMetadata = readJSONObject(path: metadataURL.path) ?? [:]
        let existingState = readJSONObject(path: sessionPath) ?? [:]
        let id = (existingMetadata["id"] as? String) ?? (existingState["id"] as? String) ?? sessionDirectory.lastPathComponent
        let startedAt = (existingMetadata["startedAt"] as? String) ?? (existingState["startedAt"] as? String) ?? (existingState["started_at"] as? String) ?? endedAt
        let publicMetadata: [String: Any] = [
            "endedAt": endedAt,
            "endReason": endReason,
            "eventsPath": eventsPath,
            "id": id,
            "startedAt": startedAt
        ]
        writeJSONObject(publicMetadata, path: metadataURL.path)

        var updatedState = existingState
        updatedState["status"] = status
        updatedState["endedAt"] = endedAt
        updatedState["ended_at"] = endedAt
        updatedState["endReason"] = endReason
        updatedState["end_reason"] = endReason
        var recorder = updatedState["recorder"] as? [String: Any] ?? [:]
        recorder["kind"] = recorder["kind"] ?? "native-macos-recorder"
        recorder["stopped_at"] = endedAt
        updatedState["recorder"] = recorder
        writeJSONObject(updatedState, path: sessionPath)
    }

    func isOwnProcess(app: [String: Any]) -> Bool {
        guard let pid = app["pid"] as? Int32 else { return false }
        return pid == getpid()
    }

    static func nextEventId(eventsPath: String) -> Int {
        guard let data = try? String(contentsOfFile: eventsPath, encoding: .utf8) else { return 1 }
        return data.split(separator: "\n").count + 1
    }
}

final class AXTreeRenderer {
    var nextIndex = 0
    var lines: [String] = []
    let maxNodes: Int
    let maxChars: Int

    init(maxNodes: Int = 450, maxChars: Int = 80_000) {
        self.maxNodes = maxNodes
        self.maxChars = maxChars
    }

    func render(root: AXUIElement) -> String {
        nextIndex = 0
        lines = []
        visit(root, depth: 0)
        return lines.joined(separator: "\n")
    }

    func visit(_ element: AXUIElement, depth: Int) {
        if nextIndex >= maxNodes || lines.joined(separator: "\n").count > maxChars { return }
        let index = nextIndex
        nextIndex += 1
        lines.append("\(String(repeating: "\t", count: depth))\(index) \(elementLine(element))")
        for child in children(of: element).prefix(80) {
            visit(child, depth: depth + 1)
        }
    }
}

let eventTapCallback: CGEventTapCallBack = { _, type, event, userInfo in
    if let userInfo {
        let recorder = Unmanaged<NativeRecorder>.fromOpaque(userInfo).takeUnretainedValue()
        recorder.handleEvent(type: type, event: event)
    }
    return Unmanaged.passUnretained(event)
}

func appDictionary(app: NSRunningApplication) -> [String: Any] {
    [
        "name": app.localizedName ?? "",
        "bundle_id": app.bundleIdentifier ?? "",
        "pid": app.processIdentifier
    ]
}

func focusedWindow(appElement: AXUIElement) -> AXUIElement? {
    elementAttribute(appElement, kAXFocusedWindowAttribute)
}

func firstWindow(appElement: AXUIElement) -> AXUIElement? {
    guard let windows: [AXUIElement] = arrayAttribute(appElement, kAXWindowsAttribute) else { return nil }
    return windows.first
}

func elementAttribute(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    return value.map { unsafeBitCast($0, to: AXUIElement.self) }
}

func arrayAttribute<T>(_ element: AXUIElement, _ attribute: String) -> [T]? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    return value as? [T]
}

func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    if let string = value as? String { return string }
    if let number = value as? NSNumber { return number.stringValue }
    if let url = value as? URL { return url.absoluteString }
    return nil
}

func boolAttribute(_ element: AXUIElement, _ attribute: String) -> Bool? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    return value as? Bool
}

func children(of element: AXUIElement) -> [AXUIElement] {
    arrayAttribute(element, kAXChildrenAttribute) ?? []
}

func semanticTarget(element: AXUIElement, point: CGPoint?) -> [String: Any] {
    let refined = point.flatMap { deepestElement(at: $0, in: element) } ?? element
    let target = isRicher(element: refined, than: element) ? refined : element
    var result = summarize(element: target)
    if let frame = frame(of: target) {
        result["frame"] = ["x": frame.origin.x, "y": frame.origin.y, "width": frame.width, "height": frame.height]
    }

    let path = ancestry(of: target).map { summarize(element: $0) }.filter { !$0.isEmpty }
    if !path.isEmpty {
        result["path"] = path
    }

    if isGenericTarget(result) {
        let localTree = AXTreeRenderer(maxNodes: 80, maxChars: 12_000).render(root: target)
        if !localTree.isEmpty {
            result["local_ax"] = localTree
        }
    }
    return result
}

func deepestElement(at point: CGPoint, in root: AXUIElement, depth: Int = 0) -> AXUIElement? {
    if depth > 8 { return root }
    let matchingChildren = children(of: root).filter { child in
        guard let rect = frame(of: child) else { return false }
        return rect.contains(point)
    }
    for child in matchingChildren.reversed() {
        if let descendant = deepestElement(at: point, in: child, depth: depth + 1) {
            return descendant
        }
    }
    return root
}

func isRicher(element candidate: AXUIElement, than original: AXUIElement) -> Bool {
    let candidateSummary = summarize(element: candidate)
    let originalSummary = summarize(element: original)
    if candidateSummary.isEmpty { return false }
    if isGenericTarget(originalSummary) && !isGenericTarget(candidateSummary) { return true }
    return semanticScore(candidateSummary) > semanticScore(originalSummary)
}

func semanticScore(_ summary: [String: Any]) -> Int {
    var score = 0
    for key in ["title", "description", "identifier", "value"] {
        if let value = summary[key] as? String, !value.isEmpty { score += 3 }
    }
    if let role = summary["role"] as? String {
        if ["AXButton", "AXTextArea", "AXTextField", "AXImage", "AXStaticText", "AXMenuItem"].contains(role) {
            score += 2
        }
        if ["AXScrollArea", "AXGroup", "AXUnknown"].contains(role) {
            score -= 1
        }
    }
    return score
}

func isGenericTarget(_ summary: [String: Any]) -> Bool {
    let role = summary["role"] as? String ?? ""
    let hasSemanticLabel = ["title", "description", "identifier", "value"].contains { key in
        guard let value = summary[key] as? String else { return false }
        return !value.isEmpty
    }
    return !hasSemanticLabel && ["AXScrollArea", "AXGroup", "AXUnknown", ""].contains(role)
}

func normalizedClickTarget(_ target: [String: Any], ax: [String: Any]?, releaseTarget: [String: Any]?) -> [String: Any] {
    let axText = ax?["text"] as? String ?? ""
    let localAX = target["local_ax"] as? String ?? ""
    let candidates = actionItemCandidates(from: localAX.isEmpty ? axText : localAX)
    let releaseDisagreesAndDegrades = releaseTarget.map { isActionTarget(target) && isGenericTarget($0) } ?? false
    guard releaseDisagreesAndDegrades || isAmbiguousTransientActionTarget(target, candidates: candidates) else {
        return target
    }
    let reason = releaseDisagreesAndDegrades ? "press_release_target_disagree" : "transient_action_hit_test_ambiguous"
    return [
        "role": "AXActionCluster",
        "description": "transient action cluster",
        "confidence": "low",
        "reason": reason,
        "hit_test_candidate": compactTargetIdentity(target),
        "action_items": candidates
    ]
}

func isActionTarget(_ target: [String: Any]) -> Bool {
    let role = target["role"] as? String ?? ""
    if ["AXButton", "AXMenuItem", "AXCheckBox", "AXRadioButton"].contains(role) { return true }
    return ["title", "description", "identifier", "value"].contains { key in
        guard let value = target[key] as? String else { return false }
        return !value.isEmpty
    }
}

func isAmbiguousTransientActionTarget(_ target: [String: Any], candidates: [[String: Any]]) -> Bool {
    if candidates.count < 3 { return false }
    let role = target["role"] as? String ?? ""
    if ["AXUnknown", "AXGroup", "AXMenu", "AXMenuItem", "AXButton", ""].contains(role) {
        return true
    }
    if isGenericTarget(target) {
        return true
    }
    return false
}

func isTransientActionCluster(axText: String) -> Bool {
    actionItemCandidates(from: axText).count >= 3
}

func actionItemCandidates(from axText: String) -> [[String: Any]] {
    var result: [[String: Any]] = []
    for line in axText.split(separator: "\n").map(String.init) {
        guard isActionItemLine(line) else { continue }
        let summary = actionItemSummary(from: line)
        let key = stableJSONString(summary)
        if result.contains(where: { stableJSONString($0) == key }) { continue }
        result.append(summary)
    }
    return result
}

func isActionItemLine(_ line: String) -> Bool {
    let normalized = line.lowercased()
    return normalized.contains("button") ||
        normalized.contains("menu item") ||
        normalized.contains("menuitem") ||
        normalized.contains("checkbox") ||
        normalized.contains("radio")
}

func actionItemSummary(from line: String) -> [String: Any] {
    let normalized = normalizedSemanticLine(line)
    var result: [String: Any] = ["raw": normalized]
    if normalized.lowercased().contains("button") { result["role"] = "AXButton" }
    if normalized.lowercased().contains("menu item") || normalized.lowercased().contains("menuitem") { result["role"] = "AXMenuItem" }
    if let description = captureAfter(label: "Description:", in: normalized) {
        result["description"] = description
    }
    if let value = captureAfter(label: "Value:", in: normalized) {
        result["value"] = value
    }
    return result
}

func captureAfter(label: String, in text: String) -> String? {
    guard let range = text.range(of: label) else { return nil }
    let suffix = String(text[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
    if suffix.isEmpty { return nil }
    let stopLabels = [" Description:", " Value:", " Placeholder:", " ID:"].filter { $0.trimmingCharacters(in: .whitespaces).lowercased() != label.trimmingCharacters(in: .whitespaces).lowercased() }
    var endIndex = suffix.endIndex
    for stop in stopLabels {
        if let stopRange = suffix.range(of: stop), stopRange.lowerBound < endIndex {
            endIndex = stopRange.lowerBound
        }
    }
    return String(suffix[..<endIndex]).trimmingCharacters(in: .whitespacesAndNewlines)
}

func targetQualityScore(_ target: [String: Any]) -> Int {
    var score = semanticScore(target)
    if let localAX = target["local_ax"] as? String, !localAX.isEmpty { score += 1 }
    if let path = target["path"] as? [[String: Any]], !path.isEmpty {
        score += min(3, path.reduce(0) { $0 + max(0, semanticScore($1)) })
    }
    if let role = target["role"] as? String, ["AXMenuItem", "AXButton"].contains(role) {
        score += 4
    }
    return score
}

func targetsDiffer(_ lhs: [String: Any], _ rhs: [String: Any]) -> Bool {
    stableJSONString(compactTargetIdentity(lhs)) != stableJSONString(compactTargetIdentity(rhs))
}

func ancestry(of element: AXUIElement, limit: Int = 8) -> [AXUIElement] {
    var result: [AXUIElement] = []
    var current: AXUIElement? = element
    var remaining = limit
    while let item = current, remaining > 0 {
        result.insert(item, at: 0)
        current = elementAttribute(item, kAXParentAttribute)
        remaining -= 1
    }
    return result
}

func frame(of element: AXUIElement) -> CGRect? {
    guard let position = pointAttribute(element, kAXPositionAttribute),
          let size = sizeAttribute(element, kAXSizeAttribute) else {
        return nil
    }
    return CGRect(origin: position, size: size)
}

func pointAttribute(_ element: AXUIElement, _ attribute: String) -> CGPoint? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
          let axValue = value,
          CFGetTypeID(axValue) == AXValueGetTypeID() else {
        return nil
    }
    var point = CGPoint.zero
    guard AXValueGetValue((axValue as! AXValue), .cgPoint, &point) else { return nil }
    return point
}

func sizeAttribute(_ element: AXUIElement, _ attribute: String) -> CGSize? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
          let axValue = value,
          CFGetTypeID(axValue) == AXValueGetTypeID() else {
        return nil
    }
    var size = CGSize.zero
    guard AXValueGetValue((axValue as! AXValue), .cgSize, &size) else { return nil }
    return size
}

func elementLine(_ element: AXUIElement) -> String {
    let role = cleanAX(stringAttribute(element, kAXRoleAttribute) ?? "unknown")
    let subrole = cleanAX(stringAttribute(element, kAXSubroleAttribute) ?? "")
    let title = stringAttribute(element, kAXTitleAttribute) ?? ""
    let description = stringAttribute(element, kAXDescriptionAttribute) ?? ""
    let identifier = stringAttribute(element, kAXIdentifierAttribute) ?? ""
    let placeholder = stringAttribute(element, "AXPlaceholderValue") ?? ""
    let url = stringAttribute(element, "AXURL") ?? ""
    let value = stringAttribute(element, kAXValueAttribute) ?? ""
    var parts = [role]
    if !subrole.isEmpty { parts.append(subrole) }
    if !title.isEmpty { parts.append(title) }
    if !description.isEmpty { parts.append("Description: \(description)") }
    if !placeholder.isEmpty { parts.append("Placeholder: \(placeholder)") }
    if !identifier.isEmpty { parts.append("ID: \(identifier)") }
    if !url.isEmpty { parts.append("URL: \(url)") }
    if !value.isEmpty && value.count < 180 { parts.append("Value: \(value)") }
    return parts.joined(separator: " ")
}

func windowDictionary(element: AXUIElement) -> [String: Any] {
    var result: [String: Any] = ["title": stringAttribute(element, kAXTitleAttribute) ?? ""]
    if let url = stringAttribute(element, "AXURL"), !url.isEmpty {
        result["url"] = url
    } else if let webArea = firstDescendant(withRole: "AXWebArea", in: element),
              let url = stringAttribute(webArea, "AXURL"), !url.isEmpty {
        result["url"] = url
    }
    return result
}

func firstDescendant(withRole role: String, in root: AXUIElement, maxNodes: Int = 250) -> AXUIElement? {
    var queue = [root]
    var visited = 0
    while !queue.isEmpty && visited < maxNodes {
        let element = queue.removeFirst()
        visited += 1
        if stringAttribute(element, kAXRoleAttribute) == role {
            return element
        }
        queue.append(contentsOf: children(of: element).prefix(80))
    }
    return nil
}

func summarize(element: AXUIElement) -> [String: Any] {
    var result: [String: Any] = [:]
    if let role = stringAttribute(element, kAXRoleAttribute) { result["role"] = role }
    if let subrole = stringAttribute(element, kAXSubroleAttribute) { result["subrole"] = subrole }
    if let title = stringAttribute(element, kAXTitleAttribute), !title.isEmpty { result["title"] = title }
    if let description = stringAttribute(element, kAXDescriptionAttribute), !description.isEmpty { result["description"] = description }
    if let placeholder = stringAttribute(element, "AXPlaceholderValue"), !placeholder.isEmpty { result["placeholder"] = placeholder }
    if let identifier = stringAttribute(element, kAXIdentifierAttribute), !identifier.isEmpty { result["identifier"] = identifier }
    if let value = stringAttribute(element, kAXValueAttribute), !value.isEmpty && value.count < 300 { result["value"] = value }
    return result
}

func selectedTextRange(element: AXUIElement) -> [String: Any]? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, "AXSelectedTextRange" as CFString, &value) == .success,
          let axValue = value,
          CFGetTypeID(axValue) == AXValueGetTypeID() else {
        return nil
    }
    var range = CFRange()
    guard AXValueGetValue((axValue as! AXValue), .cfRange, &range) else { return nil }
    return ["location": range.location, "length": range.length]
}

func selectedItemsFrom(element: AXUIElement) -> [[String: Any]] {
    var result: [[String: Any]] = []
    if boolAttribute(element, kAXSelectedAttribute) == true {
        result.append(summarize(element: element))
    }
    if let selectedChildren: [AXUIElement] = arrayAttribute(element, kAXSelectedChildrenAttribute) {
        result.append(contentsOf: selectedChildren.map { summarize(element: $0) })
    }
    if let selectedRows: [AXUIElement] = arrayAttribute(element, kAXSelectedRowsAttribute) {
        result.append(contentsOf: selectedRows.map { summarize(element: $0) })
    }
    return result
}

func selectedItemsInTree(root: AXUIElement, maxNodes: Int) -> [[String: Any]] {
    var queue = [root]
    var result: [[String: Any]] = []
    var visited = 0
    while !queue.isEmpty && visited < maxNodes {
        let element = queue.removeFirst()
        visited += 1
        result.append(contentsOf: selectedItemsFrom(element: element))
        queue.append(contentsOf: children(of: element).prefix(80))
    }
    return result
}

func cleanSelectedItems(_ items: [[String: Any]]) -> [[String: Any]] {
    let deduped = dedupe(items: items)
    let hasRichItems = deduped.contains { semanticScore($0) > 1 }
    let filtered = deduped.filter { item in
        let role = item["role"] as? String ?? ""
        let subrole = item["subrole"] as? String ?? ""
        if ["AXRow", "AXCell"].contains(role) { return false }
        if subrole == "AXOutlineRow" { return false }
        if !hasRichItems { return semanticScore(item) > 0 }
        return true
    }
    var seenSemanticKeys = Set<String>()
    var result: [[String: Any]] = []
    for item in filtered {
        let semanticKey = (item["identifier"] as? String)
            ?? (item["title"] as? String)
            ?? (item["description"] as? String)
            ?? stableJSONString(item)
        if seenSemanticKeys.contains(semanticKey) { continue }
        seenSemanticKeys.insert(semanticKey)
        result.append(item)
    }
    return result
}

func inputTargetIdentity(_ target: [String: Any]) -> [String: Any] {
    var result = compactTargetIdentity(target)
    result["value"] = nil
    if let path = target["path"] as? [[String: Any]] {
        result["path"] = path.map { item -> [String: Any] in
            var compact = compactTargetIdentity(item)
            compact["value"] = nil
            return compact
        }
    }
    return result
}

func compactTargetIdentity(_ target: [String: Any]) -> [String: Any] {
    var result: [String: Any] = [:]
    for key in ["role", "subrole", "title", "description", "identifier", "value"] {
        if let value = target[key], hasJSONMeaningfulValue(value) {
            result[key] = value
        }
    }
    if let frame = target["frame"] as? [String: Any] {
        result["frame"] = [
            "x": roundedNumber(frame["x"]),
            "y": roundedNumber(frame["y"]),
            "width": roundedNumber(frame["width"]),
            "height": roundedNumber(frame["height"])
        ]
    }
    return result
}

func hasJSONMeaningfulValue(_ value: Any) -> Bool {
    if let string = value as? String { return !string.isEmpty }
    if let array = value as? [Any] { return !array.isEmpty }
    if let dictionary = value as? [String: Any] { return !dictionary.isEmpty }
    return true
}

func roundedNumber(_ value: Any?) -> Int {
    if let number = value as? NSNumber { return Int(round(number.doubleValue)) }
    if let double = value as? Double { return Int(round(double)) }
    if let cgFloat = value as? CGFloat { return Int(round(cgFloat)) }
    return 0
}

func semanticSignature(from axText: String) -> [String] {
    var parts: [String] = []
    for rawLine in axText.split(separator: "\n") {
        let line = String(rawLine)
        if line.contains("Address and search bar Value:") ||
            line.contains("ComboBox Value:") ||
            line.contains("YouTube Video Player") ||
            line.contains("Audio playing") ||
            line.contains("fileUploadReconfirm") ||
            line.contains("OpenButton") ||
            line.contains("OKButton") ||
            line.contains("AXTextArea") ||
            line.contains("TextArea") ||
            line.contains("Heading ") ||
            line.contains("Description: Search") ||
            line.contains("Description: YouTube") {
            parts.append(normalizedSemanticLine(line))
        }
    }
    if parts.isEmpty {
        let staticTexts = axText
            .split(separator: "\n")
            .map(String.init)
            .filter { $0.contains("StaticText Value:") }
            .prefix(12)
            .map(normalizedSemanticLine)
        parts.append(contentsOf: staticTexts)
    }
    return Array(parts.prefix(80))
}

func normalizedSemanticLine(_ line: String) -> String {
    line
        .replacingOccurrences(of: #"^\s*\d+\s+"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func isHighValueSemanticChange(_ previousKey: String, _ nextKey: String) -> Bool {
    if previousKey.isEmpty { return true }
    let markers = [
        "Audio playing",
        "watch?v=",
        "results?search_query=",
        "YouTube Video Player",
        "fileUploadReconfirm",
        "Address and search bar Value:",
        "ComboBox Value:"
    ]
    return markers.contains { marker in
        previousKey.contains(marker) != nextKey.contains(marker)
    }
}

func axDiffText(previous: String, next: String) -> String {
    let previousLines = previous.split(separator: "\n").map(String.init)
    let nextLines = next.split(separator: "\n").map(String.init)
    let previousSet = Set(previousLines)
    let nextSet = Set(nextLines)
    var lines: [String] = []

    let removed = previousLines.filter { !nextSet.contains($0) }.prefix(120)
    if !removed.isEmpty {
        lines.append("Removed lines:")
        lines.append(contentsOf: removed.map { "-\($0)" })
    }

    let added = nextLines.filter { !previousSet.contains($0) }.prefix(160)
    lines.append(contentsOf: added.map { "+\($0)" })

    let text = lines.joined(separator: "\n")
    if text.count <= 80_000 { return text }
    return String(text.prefix(80_000))
}

func dedupe(items: [[String: Any]]) -> [[String: Any]] {
    var seen = Set<String>()
    var result: [[String: Any]] = []
    for item in items {
        let key = stableJSONString(item)
        if seen.contains(key) { continue }
        seen.insert(key)
        result.append(item)
    }
    return result
}

func cleanAX(_ value: String) -> String {
    value.replacingOccurrences(of: "AX", with: "")
}

func unicodeString(from event: CGEvent) -> String {
    var actualLength = 0
    var chars = [UniChar](repeating: 0, count: 16)
    event.keyboardGetUnicodeString(maxStringLength: 16, actualStringLength: &actualLength, unicodeString: &chars)
    guard actualLength > 0 else { return "" }
    return String(utf16CodeUnits: chars, count: actualLength)
}

func shortcutString(event: CGEvent, keyCode: Int64) -> String {
    var parts: [String] = []
    if event.flags.contains(.maskCommand) { parts.append("command") }
    if event.flags.contains(.maskControl) { parts.append("control") }
    if event.flags.contains(.maskAlternate) { parts.append("option") }
    if event.flags.contains(.maskShift) { parts.append("shift") }
    parts.append(keyName(keyCode: keyCode, event: event))
    return parts.joined(separator: "+")
}

func keyName(keyCode: Int64, event: CGEvent) -> String {
    let text = unicodeString(from: event).trimmingCharacters(in: .whitespacesAndNewlines)
    if text.count == 1 { return text.lowercased() }
    switch keyCode {
    case 36, 76: return "return"
    case 48: return "tab"
    case 49: return "space"
    case 51: return "delete"
    case 53: return "escape"
    case 123: return "left"
    case 124: return "right"
    case 125: return "down"
    case 126: return "up"
    default: return "key:\(keyCode)"
    }
}

func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
    let dx = a.x - b.x
    let dy = a.y - b.y
    return sqrt(dx * dx + dy * dy)
}

func stableJSONString(_ value: Any) -> String {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
          let string = String(data: data, encoding: .utf8) else {
        return String(describing: value)
    }
    return string
}

func readJSONObject(path: String) -> [String: Any]? {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let object = try? JSONSerialization.jsonObject(with: data),
          let dictionary = object as? [String: Any] else {
        return nil
    }
    return dictionary
}

func writeJSONObject(_ value: [String: Any], path: String) {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]) else {
        return
    }
    try? data.write(to: URL(fileURLWithPath: path))
}

func isoNow() -> String {
    ISO8601DateFormatter().string(from: Date())
}

func currentPermissionStatus(request: Bool) -> PermissionStatus {
    if request {
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary)
    }

    var inputMonitoringTrusted = CGPreflightListenEventAccess()
    if request && !inputMonitoringTrusted {
        inputMonitoringTrusted = CGRequestListenEventAccess()
    }

    let accessibilityTrusted = AXIsProcessTrusted()
    let missing = [
        accessibilityTrusted ? nil : "accessibility",
        inputMonitoringTrusted ? nil : "input_monitoring"
    ].compactMap { $0 }
    let instructions = [
        accessibilityTrusted ? nil : "Enable Privacy & Security -> Accessibility for the launching app, Node.js, Terminal, or orr-platform-macos.",
        inputMonitoringTrusted ? nil : "Enable Privacy & Security -> Input Monitoring for the launching app, Node.js, Terminal, or orr-platform-macos."
    ].compactMap { $0 }

    return PermissionStatus(
        schema_version: 1,
        kind: "permissions.status",
        timestamp: isoNow(),
        accessibilityTrusted: accessibilityTrusted,
        inputMonitoringTrusted: inputMonitoringTrusted,
        recorderReady: accessibilityTrusted && inputMonitoringTrusted,
        missing: missing,
        instructions: instructions
    )
}

func printJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    if let data = try? encoder.encode(value) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    }
}

func parseArgs(_ argv: [String]) -> [String: String] {
    var result: [String: String] = [:]
    var index = 0
    while index < argv.count {
        let arg = argv[index]
        if arg.hasPrefix("--"), index + 1 < argv.count {
            result[String(arg.dropFirst(2))] = argv[index + 1]
            index += 2
        } else {
            index += 1
        }
    }
    return result
}

let args = Array(CommandLine.arguments.dropFirst())

switch args.first {
case "permissions-check":
    printJSON(currentPermissionStatus(request: false))
case "permissions-request":
    printJSON(currentPermissionStatus(request: true))
case "record":
    let options = parseArgs(Array(args.dropFirst()))
    guard let session = options["session"], let events = options["events"] else {
        FileHandle.standardError.write("Usage: orr-platform-macos record --session <orr_session.json> --events <events.jsonl> [--manifest <recording_manifest.json>]\n".data(using: .utf8)!)
        exit(2)
    }
    NativeRecorder(sessionPath: session, eventsPath: events, manifestPath: options["manifest"]).run()
case "active-window-tree":
    let trusted = AXIsProcessTrusted()
    let inputTrusted = CGPreflightListenEventAccess()
    let app = NSWorkspace.shared.frontmostApplication
    let snapshot = Snapshot(
        schema_version: 1,
        kind: "active-window-tree",
        timestamp: isoNow(),
        activeApp: app.map { AppInfo(name: $0.localizedName, bundleIdentifier: $0.bundleIdentifier, processIdentifier: $0.processIdentifier) },
        accessibilityTrusted: trusted,
        inputMonitoringTrusted: inputTrusted
    )
    printJSON(snapshot)
case "open-chrome":
    let url = URL(string: "https://www.youtube.com")!
    NSWorkspace.shared.open([url], withApplicationAt: URL(fileURLWithPath: "/Applications/Google Chrome.app"), configuration: NSWorkspace.OpenConfiguration()) { _, error in
        if let error = error {
            FileHandle.standardError.write("\(error.localizedDescription)\n".data(using: .utf8)!)
            exit(1)
        }
        exit(0)
    }
    RunLoop.current.run()
default:
    print("""
    ORRPlatformMacOS

    Commands:
      permissions-check   Print macOS Accessibility/Input Monitoring status as JSON.
      permissions-request Request macOS Accessibility/Input Monitoring permissions, then print status.
      record               Record native macOS AX/input events to events.jsonl.
      active-window-tree   Print frontmost app metadata and permission trust state.
      open-chrome          Open YouTube in Google Chrome.
    """)
}
