// myynd-fronte: chi c'è davanti sul Mac, una riga JSON a ogni cambio.
//
// Lo lancia il guscio (`desktop/fronte.ts`) e lo tiene in vita col suo stdin:
// quando stdin si chiude — Myynd è uscita, anche male — il programma esce.
// Non chiede mai permessi. Con `--titoli` legge il titolo della finestra
// davanti solo se il Mac ha già dato a Myynd il permesso di Accessibilità;
// senza, il titolo è sempre null.
//
//   myynd-fronte --versione   → {"versione":1} ed esce (l'unico modo di provarlo)
//   myynd-fronte [--titoli]   → {"bundle":"com.apple.Safari","app":"Safari","pid":123,"titolo":"…","t":1727160000000}
//
// Su stdin, una riga «ora» fa scrivere subito chi c'è davanti, anche se non è
// cambiato: il guscio la manda dopo un blocco dello schermo o un sonno.
//
// Lo costruisce `build/fronte.cjs` (universale, arm64 e x86_64).

import AppKit
import ApplicationServices

setvbuf(stdout, nil, _IOLBF, 0)

let argomenti = CommandLine.arguments
if argomenti.contains("--versione") {
  print("{\"versione\":1}")
  exit(0)
}
let conTitoli = argomenti.contains("--titoli")

let TITOLO_MASSIMO = 300
let RINVIO = 0.3
let OGNI = 5.0

/** Il permesso di Accessibilità, senza mai chiederlo. */
func fidato() -> Bool {
  let opzioni = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false] as CFDictionary
  return AXIsProcessTrustedWithOptions(opzioni)
}

func scrivi(_ oggetto: [String: Any]) {
  guard let dati = try? JSONSerialization.data(withJSONObject: oggetto, options: [.withoutEscapingSlashes]) else { return }
  FileHandle.standardOutput.write(dati)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

final class Osservatore {
  var pid: pid_t = 0
  var elementoApp: AXUIElement?
  var finestra: AXUIElement?
  var osservatore: AXObserver?
  var ultima = ""
  var rinvio: DispatchWorkItem?

  init() {
    let centro = NSWorkspace.shared.notificationCenter
    centro.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] nota in
      let app = nota.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
      self?.attiva(app)
    }
    Timer.scheduledTimer(withTimeInterval: OGNI, repeats: true) { [weak self] _ in
      self?.emetti(sempre: false)
    }
    attiva(NSWorkspace.shared.frontmostApplication)
    emetti(sempre: true)
  }

  /** Un'app nuova davanti: ci si iscrive ai suoi cambi di finestra e di titolo. */
  func attiva(_ app: NSRunningApplication?) {
    togliOsservatore()
    pid = app?.processIdentifier ?? 0
    if app != nil, conTitoli, fidato() {
      let el = AXUIElementCreateApplication(pid)
      AXUIElementSetMessagingTimeout(el, 0.5)
      elementoApp = el
      var obs: AXObserver?
      let richiamo: AXObserverCallback = { _, _, _, refcon in
        guard let refcon = refcon else { return }
        let me = Unmanaged<Osservatore>.fromOpaque(refcon).takeUnretainedValue()
        me.cambiato()
      }
      if AXObserverCreate(pid, richiamo, &obs) == .success, let obs = obs {
        osservatore = obs
        let io = Unmanaged.passUnretained(self).toOpaque()
        AXObserverAddNotification(obs, el, kAXFocusedWindowChangedNotification as CFString, io)
        AXObserverAddNotification(obs, el, kAXTitleChangedNotification as CFString, io)
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .defaultMode)
        seguiFinestra()
      }
    }
    pianifica()
  }

  func togliOsservatore() {
    if let obs = osservatore {
      if let el = elementoApp {
        AXObserverRemoveNotification(obs, el, kAXFocusedWindowChangedNotification as CFString)
        AXObserverRemoveNotification(obs, el, kAXTitleChangedNotification as CFString)
      }
      if let w = finestra { AXObserverRemoveNotification(obs, w, kAXTitleChangedNotification as CFString) }
      CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .defaultMode)
    }
    osservatore = nil
    elementoApp = nil
    finestra = nil
  }

  /** Il titolo cambia sulla finestra, non sull'app: ci si iscrive a quella davanti. */
  func seguiFinestra() {
    guard let obs = osservatore else { return }
    if let w = finestra { AXObserverRemoveNotification(obs, w, kAXTitleChangedNotification as CFString) }
    finestra = finestraDavanti()
    if let w = finestra {
      AXObserverAddNotification(obs, w, kAXTitleChangedNotification as CFString, Unmanaged.passUnretained(self).toOpaque())
    }
  }

  func cambiato() {
    seguiFinestra()
    pianifica()
  }

  /** I cambi arrivano a raffiche: si scrive trecento millesimi dopo l'ultimo. */
  func pianifica() {
    rinvio?.cancel()
    let lavoro = DispatchWorkItem { [weak self] in self?.emetti(sempre: false) }
    rinvio = lavoro
    DispatchQueue.main.asyncAfter(deadline: .now() + RINVIO, execute: lavoro)
  }

  func finestraDavanti() -> AXUIElement? {
    guard let el = elementoApp else { return nil }
    var valore: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, kAXFocusedWindowAttribute as CFString, &valore) == .success,
          let v = valore, CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
    return (v as! AXUIElement)
  }

  func titolo() -> String? {
    guard conTitoli, fidato(), let w = finestraDavanti() else { return nil }
    var valore: CFTypeRef?
    guard AXUIElementCopyAttributeValue(w, kAXTitleAttribute as CFString, &valore) == .success,
          let s = valore as? String, !s.isEmpty else { return nil }
    return String(s.prefix(TITOLO_MASSIMO))
  }

  /** Chi c'è davanti adesso; si scrive solo se è cambiato, o se lo si chiede. */
  func emetti(sempre: Bool) {
    guard let app = NSWorkspace.shared.frontmostApplication else { return }
    if app.processIdentifier != pid && elementoApp != nil { attiva(app); return }
    let bundle = app.bundleIdentifier ?? ""
    let nome = app.localizedName ?? bundle
    let t = titolo()
    let chiave = "\(bundle)\u{0}\(app.processIdentifier)\u{0}\(t ?? "\u{1}")"
    if !sempre && chiave == ultima { return }
    ultima = chiave
    scrivi([
      "bundle": bundle, "app": nome, "pid": Int(app.processIdentifier),
      "titolo": t.map { $0 as Any } ?? NSNull(),
      "t": Int64((Date().timeIntervalSince1970 * 1000).rounded())
    ])
  }
}

let io = Osservatore()

// stdin chiuso: il guscio non c'è più, e nemmeno noi
Thread.detachNewThread {
  while let riga = readLine(strippingNewline: true) {
    if riga == "ora" { DispatchQueue.main.async { io.emetti(sempre: true) } }
  }
  exit(0)
}

RunLoop.main.run()
