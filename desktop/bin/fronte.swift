// myynd-fronte: chi c'è davanti sul Mac, una riga JSON a ogni cambio.
//
// Lo lancia il guscio (`desktop/fronte.ts`) e lo tiene in vita col suo stdin:
// quando stdin si chiude — Myynd è uscita, anche male — il programma esce.
// Non chiede mai permessi. Con `--titoli` legge il titolo della finestra
// davanti solo se il Mac ha già dato a Myynd il permesso di Accessibilità;
// senza, il titolo è sempre null.
//
// Con `--testi` (acceso a mano da lui, e sempre col permesso) legge anche il
// testo visibile della finestra davanti: al cambio d'app o di finestra, a una
// pausa mentre scrive, e ogni `--ogni` secondi (venti di serie) se è cambiato.
// La lettura ha tre tetti — quattrocento nodi, otto mila caratteri, centocinquanta
// millesimi — e salta i campi password, i gestori di password, le finestre
// private, le app di banche e salute e quelle in `--escludi`. Il documento
// (AXDocument) e l'indirizzo della pagina (AXURL) vengono con lui, quando l'app
// li dice. Il resto (le chiavi, le carte, i siti esclusi) lo ripulisce il server.
//
//   myynd-fronte --versione   → {"versione":2} ed esce (l'unico modo di provarlo)
//   myynd-fronte [--titoli]   → {"bundle":"com.apple.Safari","app":"Safari","pid":123,"titolo":"…","t":1727160000000}
//   myynd-fronte --titoli --testi [--ogni 20] [--escludi a,b]
//                             → anche {"tipo":"testo","bundle":…,"documento":…,"url":…,"testo":"…","t":…}
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
  print("{\"versione\":2}")
  exit(0)
}
let conTitoli = argomenti.contains("--titoli")
let conTesti = argomenti.contains("--testi")

func valoreDopo(_ nome: String) -> String? {
  guard let i = argomenti.firstIndex(of: nome), i + 1 < argomenti.count else { return nil }
  return argomenti[i + 1]
}

let TITOLO_MASSIMO = 300
let RINVIO = 0.3
let OGNI = 5.0
/** Il testo: ogni quanti secondi si rilegge anche senza un cambio (fra cinque e seicento). */
let OGNI_TESTO = min(600.0, max(5.0, Double(valoreDopo("--ogni") ?? "") ?? 20.0))
/** Dopo un cambio d'app o di finestra, e dopo l'ultimo tasto. */
let RINVIO_TESTO = 1.0
let PAUSA_SCRITTURA = 3.0
let NODI_MASSIMI = 400
let TESTO_MASSIMO = 8000
let TEMPO_MASSIMO = 0.15
let FIGLI_MASSIMI = 80
/** Quanto si aspetta un elemento che non risponde, al massimo, per una domanda. */
let ATTESA_ELEMENTO = 0.05

// il tetto per tutti gli elementi, prima ancora di chiedere: vale per ogni app
AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 0.25)

/** Le app da non leggere mai: le stesse dell'osservatore, più le sue. */
let ESCLUSE: Set<String> = {
  var s: Set<String> = [
    "com.myynd.app", "com.github.Electron",
    "com.1password.1password", "com.agilebits.onepassword7", "com.agilebits.onepassword-osx",
    "com.bitwarden.desktop", "com.lastpass.LastPass", "com.dashlane.Dashlane", "com.dashlane.dashlanephonefinal",
    "org.keepassxc.keepassxc", "com.apple.keychainaccess", "com.apple.Passwords",
    "me.proton.pass.electron", "com.nordpass.macos.NordPass", "in.sinew.Enpass-Desktop",
    "com.apple.SecurityAgent", "com.apple.LocalAuthentication.UIAgent", "com.apple.coreauthd",
    "com.apple.loginwindow", "com.apple.ScreenSaver.Engine", "com.apple.CoreServicesUIAgent"
  ]
  for e in (valoreDopo("--escludi") ?? "").split(separator: ",") {
    let x = e.trimmingCharacters(in: .whitespaces).lowercased()
    if !x.isEmpty { s.insert(x) }
  }
  return s
}()
/** Banche, salute, portafogli, password: per nome, quando la lista non basta. */
let RISERVATE = try! NSRegularExpression(pattern: "bank|banca|banking|wallet|health|salute|medical|clinic|therapy|1password|bitwarden|lastpass|dashlane|keepass|keychain|passwords?\\b|authenticator|authy", options: [.caseInsensitive])
/** Una finestra privata del browser, o una che parla di accessi e codici: niente testo. */
let PRIVATA = try! NSRegularExpression(pattern: "private browsing|navigazione (privata|anonima)|in incognito|incognito|inprivate|\\bprivat[ea]\\b|password|passcode|passkey|one.?time|\\b2fa\\b|two.?factor|verification code|codice di verifica|\\bcodice\\b|\\bverifica\\b|\\baccedi\\b|sign in|log in|\\blogin\\b|\\botp\\b", options: [.caseInsensitive])
/** I ruoli che portano testo da leggere. */
let RUOLI_TESTO: Set<String> = ["AXStaticText", "AXTextArea", "AXTextField", "AXHeading", "AXCell", "AXLink", "AXButton", "AXMenuButton", "AXComboBox"]

func trova(_ re: NSRegularExpression, _ s: String) -> Bool {
  re.firstMatch(in: s, options: [], range: NSRange(s.startIndex..., in: s)) != nil
}

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

func attributo(_ el: AXUIElement, _ nome: String) -> CFTypeRef? {
  var valore: CFTypeRef?
  guard AXUIElementCopyAttributeValue(el, nome as CFString, &valore) == .success else { return nil }
  return valore
}

func stringa(_ el: AXUIElement, _ nome: String) -> String? {
  guard let v = attributo(el, nome) else { return nil }
  if let s = v as? String { return s }
  if CFGetTypeID(v) == CFURLGetTypeID() { return (v as! URL).absoluteString }
  return nil
}

/** I figli visibili se l'app li dice, altrimenti i figli; al massimo `FIGLI_MASSIMI`. */
func figli(_ el: AXUIElement) -> [AXUIElement] {
  for nome in [kAXVisibleChildrenAttribute as String, kAXChildrenAttribute as String] {
    var valori: CFArray?
    if AXUIElementCopyAttributeValues(el, nome as CFString, 0, FIGLI_MASSIMI, &valori) == .success, let v = valori as? [AXUIElement], !v.isEmpty {
      return v
    }
  }
  return []
}

/**
 * Il testo visibile di una finestra, in ampiezza, coi suoi tre tetti. Un
 * campo password non si legge mai: né lui né i suoi figli. Torna anche
 * l'indirizzo della prima area web incontrata.
 */
func leggiFinestra(_ w: AXUIElement) -> (testo: String, url: String?) {
  let fine = Date().addingTimeInterval(TEMPO_MASSIMO)
  var coda: [AXUIElement] = [w]
  var pezzi: [String] = []
  var lunghezza = 0
  var nodi = 0
  var url: String? = nil
  var visti = Set<String>()
  while !coda.isEmpty && nodi < NODI_MASSIMI && lunghezza < TESTO_MASSIMO && Date() < fine {
    let el = coda.removeFirst()
    nodi += 1
    // un'app appesa non ferma il programma: ogni domanda a questo elemento aspetta al massimo quello che resta
    AXUIElementSetMessagingTimeout(el, Float(max(0.01, min(ATTESA_ELEMENTO, fine.timeIntervalSinceNow))))
    let ruolo = stringa(el, kAXRoleAttribute as String) ?? ""
    if Date() >= fine { break }
    let sottoruolo = stringa(el, kAXSubroleAttribute as String) ?? ""
    if ruolo == "AXSecureTextField" || sottoruolo == "AXSecureTextField" { continue }
    if ruolo == "AXWebArea" && url == nil { url = stringa(el, "AXURL") }
    if RUOLI_TESTO.contains(ruolo) {
      let t = (stringa(el, kAXValueAttribute as String) ?? stringa(el, kAXTitleAttribute as String) ?? stringa(el, kAXDescriptionAttribute as String) ?? "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
      if !t.isEmpty && !visti.contains(t) {
        visti.insert(t)
        let pezzo = String(t.prefix(TESTO_MASSIMO - lunghezza))
        pezzi.append(pezzo)
        lunghezza += pezzo.count + 1
      }
    }
    for figlio in figli(el) {
      if Date() >= fine || coda.count + nodi >= NODI_MASSIMI { break }
      coda.append(figlio)
    }
  }
  return (pezzi.joined(separator: "\n"), url)
}

final class Osservatore {
  var pid: pid_t = 0
  var elementoApp: AXUIElement?
  var finestra: AXUIElement?
  var osservatore: AXObserver?
  var ultima = ""
  var rinvio: DispatchWorkItem?
  var rinvioTesto: DispatchWorkItem?
  /** L'impronta dell'ultimo testo scritto, per finestra: lo stesso testo non si riscrive. */
  var ultimiTesti: [String: Int] = [:]

  init() {
    let centro = NSWorkspace.shared.notificationCenter
    centro.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] nota in
      let app = nota.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
      self?.attiva(app)
    }
    Timer.scheduledTimer(withTimeInterval: OGNI, repeats: true) { [weak self] _ in
      self?.emetti(sempre: false)
    }
    if conTesti {
      Timer.scheduledTimer(withTimeInterval: OGNI_TESTO, repeats: true) { [weak self] _ in
        self?.leggiTesto()
      }
    }
    attiva(NSWorkspace.shared.frontmostApplication)
    emetti(sempre: true)
  }

  /** Un'app nuova davanti: ci si iscrive ai suoi cambi di finestra, di titolo, e (col testo) di fuoco e di valore. */
  func attiva(_ app: NSRunningApplication?) {
    togliOsservatore()
    pid = app?.processIdentifier ?? 0
    if app != nil, conTitoli, fidato() {
      let el = AXUIElementCreateApplication(pid)
      AXUIElementSetMessagingTimeout(el, 0.5)
      elementoApp = el
      var obs: AXObserver?
      let richiamo: AXObserverCallback = { _, _, nome, refcon in
        guard let refcon = refcon else { return }
        let me = Unmanaged<Osservatore>.fromOpaque(refcon).takeUnretainedValue()
        me.cambiato(nome as String)
      }
      if AXObserverCreate(pid, richiamo, &obs) == .success, let obs = obs {
        osservatore = obs
        let io = Unmanaged.passUnretained(self).toOpaque()
        AXObserverAddNotification(obs, el, kAXFocusedWindowChangedNotification as CFString, io)
        AXObserverAddNotification(obs, el, kAXTitleChangedNotification as CFString, io)
        if conTesti {
          AXObserverAddNotification(obs, el, kAXFocusedUIElementChangedNotification as CFString, io)
          AXObserverAddNotification(obs, el, kAXValueChangedNotification as CFString, io)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .defaultMode)
        seguiFinestra()
      }
    }
    pianifica()
    pianificaTesto(RINVIO_TESTO)
  }

  func togliOsservatore() {
    if let obs = osservatore {
      if let el = elementoApp {
        AXObserverRemoveNotification(obs, el, kAXFocusedWindowChangedNotification as CFString)
        AXObserverRemoveNotification(obs, el, kAXTitleChangedNotification as CFString)
        if conTesti {
          AXObserverRemoveNotification(obs, el, kAXFocusedUIElementChangedNotification as CFString)
          AXObserverRemoveNotification(obs, el, kAXValueChangedNotification as CFString)
        }
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

  func cambiato(_ nome: String) {
    // un tasto: si aspetta che smetta di scrivere, e intanto niente app né titolo da riscrivere
    if nome == (kAXValueChangedNotification as String) { pianificaTesto(PAUSA_SCRITTURA); return }
    seguiFinestra()
    pianifica()
    pianificaTesto(RINVIO_TESTO)
  }

  /** I cambi arrivano a raffiche: si scrive trecento millesimi dopo l'ultimo. */
  func pianifica() {
    rinvio?.cancel()
    let lavoro = DispatchWorkItem { [weak self] in self?.emetti(sempre: false) }
    rinvio = lavoro
    DispatchQueue.main.asyncAfter(deadline: .now() + RINVIO, execute: lavoro)
  }

  func pianificaTesto(_ dopo: Double) {
    guard conTesti else { return }
    rinvioTesto?.cancel()
    let lavoro = DispatchWorkItem { [weak self] in self?.leggiTesto() }
    rinvioTesto = lavoro
    DispatchQueue.main.asyncAfter(deadline: .now() + dopo, execute: lavoro)
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

  /**
   * Il testo della finestra davanti, se tutto lo permette: il testo acceso,
   * il permesso, un'app che non è esclusa, una finestra che non è privata.
   * Si scrive solo se è cambiato dall'ultima volta per quella finestra.
   */
  func leggiTesto() {
    guard conTesti, fidato(), let app = NSWorkspace.shared.frontmostApplication else { return }
    if app.processIdentifier == getpid() { return }
    let bundle = app.bundleIdentifier ?? ""
    let nome = app.localizedName ?? bundle
    if bundle.isEmpty || ESCLUSE.contains(bundle) || ESCLUSE.contains(bundle.lowercased()) || ESCLUSE.contains(nome.lowercased()) { return }
    if trova(RISERVATE, bundle) || trova(RISERVATE, nome) { return }
    if app.processIdentifier != pid || elementoApp == nil { return }
    guard let w = finestraDavanti() else { return }
    let t = stringa(w, kAXTitleAttribute as String) ?? ""
    if !t.isEmpty && trova(PRIVATA, t) { return }
    let documento = stringa(w, kAXDocumentAttribute as String)
    let letto = leggiFinestra(w)
    let url = letto.url ?? stringa(w, "AXURL")
    if letto.testo.isEmpty { return }
    let chiave = "\(app.processIdentifier)\u{0}\(t)\u{0}\(documento ?? url ?? "")"
    let impronta = letto.testo.hashValue
    if ultimiTesti[chiave] == impronta { return }
    if ultimiTesti.count > 200 { ultimiTesti.removeAll() }
    ultimiTesti[chiave] = impronta
    scrivi([
      "tipo": "testo", "bundle": bundle, "app": nome, "pid": Int(app.processIdentifier),
      "titolo": t.isEmpty ? NSNull() : String(t.prefix(TITOLO_MASSIMO)) as Any,
      "documento": documento.map { $0 as Any } ?? NSNull(),
      "url": url.map { $0 as Any } ?? NSNull(),
      "testo": letto.testo,
      "t": Int64((Date().timeIntervalSince1970 * 1000).rounded())
    ])
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
