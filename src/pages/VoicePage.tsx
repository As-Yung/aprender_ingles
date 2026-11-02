import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { canSpeak, englishVoices, getVoicePrefs, isNaturalVoice, setVoicePrefs, speak, type VoicePrefs } from '../core/speech/speech';

const SAMPLE =
  "Hey! So, the sensor sends data to the cloud every five seconds. If the connection drops, the device keeps the readings and syncs them later. Pretty cool, right?";

export default function VoicePage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<VoicePrefs>(getVoicePrefs);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void englishVoices().then((v) => {
      setVoices(v);
      setLoaded(true);
    });
  }, []);

  const update = (p: Partial<VoicePrefs>) => setPrefs(setVoicePrefs(p));
  const natural = voices.filter(isNaturalVoice);
  const label = (v: SpeechSynthesisVoice) => `${isNaturalVoice(v) ? '⭐ ' : ''}${v.name} (${v.lang})`;

  if (!canSpeak()) {
    return (
      <div className="card">
        <h1>🔊 Voz</h1>
        <p>Este navegador no puede leer texto en voz alta. Prueba con Microsoft Edge, Chrome o Safari.</p>
      </div>
    );
  }

  return (
    <div>
      <nav className="breadcrumb">
        <Link to="/">Inicio</Link> › Voz
      </nav>
      <section className="hero">
        <h1>🔊 Voz de pronunciación</h1>
        <p>
          La app elige sola la voz más natural de tu dispositivo. Aquí puedes escucharla, cambiarla y ajustar la velocidad. Las
          voces con ⭐ son <strong>neuronales</strong>: suenan como una persona real.
        </p>
      </section>

      <div className="card">
        <label className="field">
          <span>Voz principal</span>
          <select className="input" value={prefs.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
            <option value="">Automática (la más natural{voices[0] ? `: ${voices[0].name}` : ''})</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Segunda voz (el otro personaje en los diálogos)</span>
          <select className="input" value={prefs.partnerURI} onChange={(e) => update({ partnerURI: e.target.value })}>
            <option value="">Automática</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Velocidad: {prefs.rate.toFixed(2)}× {prefs.rate === 1 ? '(natural)' : ''}</span>
          <input
            type="range"
            min={0.7}
            max={1.2}
            step={0.05}
            value={prefs.rate}
            onChange={(e) => update({ rate: Number(e.target.value) })}
          />
        </label>
        <div className="row">
          <button className="btn" type="button" onClick={() => void speak(SAMPLE)}>
            ▶️ Probar voz principal
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => void speak("Got it. I'll check the MQTT broker logs and ping you in a sec.", { speaker: 1 })}>
            ▶️ Probar segunda voz
          </button>
        </div>
      </div>

      {loaded && natural.length === 0 && (
        <div className="card">
          <h3>💡 Tu dispositivo no tiene voces naturales en inglés</h3>
          <p>Las voces actuales pueden sonar robóticas. Para una voz mucho más humana (gratis):</p>
          <ul>
            <li>
              <strong>Windows / cualquier PC:</strong> abre la app en <strong>Microsoft Edge</strong>. Trae voces “Natural” (Aria,
              Jenny, Guy, Andrew…) que suenan como personas.
            </li>
            <li>
              <strong>Chrome:</strong> usa la voz “Google US English” (necesita internet).
            </li>
            <li>
              <strong>iPhone / iPad / Mac:</strong> Ajustes → Accesibilidad → Contenido leído → Voces → Inglés, y descarga una voz
              “Mejorada” o “Premium” (por ejemplo Ava, Zoe o Evan). Luego recarga la app.
            </li>
            <li>
              <strong>Android:</strong> Ajustes → Idioma → Texto a voz → motor de Google → instala el paquete de inglés (EE. UU.)
              de alta calidad.
            </li>
          </ul>
        </div>
      )}
      {loaded && natural.length > 0 && (
        <div className="card">
          <p>
            ✅ Tienes {natural.length} voz{natural.length > 1 ? 'es' : ''} natural{natural.length > 1 ? 'es' : ''} en inglés. Consejo:
            escucha a velocidad natural (1×) para acostumbrarte al inglés real; usa 🐢 “Despacio” solo cuando lo necesites.
          </p>
        </div>
      )}
    </div>
  );
}
