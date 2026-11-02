import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PARTNER_SAMPLE, VOICE_SAMPLE } from '../core/speech/catalog';
import {
  canSpeak,
  englishVoices,
  getVoicePrefs,
  isNaturalVoice,
  loadAudioManifest,
  setVoicePrefs,
  speak,
  type VoicePrefs,
} from '../core/speech/speech';

export default function VoicePage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<VoicePrefs>(getVoicePrefs);
  const [loaded, setLoaded] = useState(false);
  const [audioCount, setAudioCount] = useState<number | null>(null);

  useEffect(() => {
    void loadAudioManifest().then((m) => setAudioCount(m ? m.ids.size : 0));
    void englishVoices().then((v) => {
      setVoices(v);
      setLoaded(true);
    });
  }, []);

  const update = (p: Partial<VoicePrefs>) => setPrefs(setVoicePrefs(p));
  const naturalVoices = voices.filter(isNaturalVoice);
  const label = (v: SpeechSynthesisVoice) => `${isNaturalVoice(v) ? '⭐ ' : ''}${v.name} (${v.lang})`;

  const natural = prefs.engine === 'natural';
  return (
    <div>
      <nav className="breadcrumb">
        <Link to="/">Inicio</Link> › Voz
      </nav>
      <section className="hero">
        <h1>🔊 Voz de pronunciación</h1>
        <p>
          Por defecto la app usa una <strong>voz neuronal libre (Kokoro)</strong> grabada para cada palabra, frase y diálogo del curso:
          suena humana y es igual en todos los dispositivos. En los diálogos, el segundo personaje tiene otra voz.
        </p>
      </section>

      <div className="card">
        <h3>Tipo de voz</h3>
        <label className="toggle">
          <input type="radio" name="engine" checked={natural} onChange={() => update({ engine: 'natural' })} /> 🎙️ Voz natural del curso
          (recomendada)
        </label>
        <br />
        <label className="toggle">
          <input type="radio" name="engine" checked={!natural} onChange={() => update({ engine: 'browser' })} /> 💻 Voz de mi dispositivo
        </label>
        {natural && audioCount === 0 && (
          <p className="muted">
            ⚠️ Los audios naturales todavía no están disponibles aquí; mientras tanto se usa la voz de tu dispositivo.
          </p>
        )}
        {natural && !!audioCount && <p className="muted">✅ {audioCount} audios naturales disponibles.</p>}
        <label className="field" style={{ marginTop: 12 }}>
          <span>
            Velocidad: {prefs.rate.toFixed(2)}× {prefs.rate === 1 ? '(natural)' : ''}
          </span>
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
          <button className="btn" type="button" onClick={() => void speak(VOICE_SAMPLE)}>
            ▶️ Probar voz principal
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => void speak(PARTNER_SAMPLE, { speaker: 1 })}>
            ▶️ Probar segunda voz
          </button>
        </div>
      </div>

      {!natural && !canSpeak() && (
        <div className="card">
          <p>Este navegador no puede leer texto en voz alta. Usa la voz natural del curso o prueba con Edge, Chrome o Safari.</p>
        </div>
      )}
      {!natural && canSpeak() && (
        <div className="card">
          <h3>Voces de tu dispositivo</h3>
          <label className="field">
            <span>Voz principal</span>
            <select className="input" value={prefs.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
              <option value="">
                Automática (la más natural
                {voices[0] ? `: ${voices[0].name}` : ''})
              </option>
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
        </div>
      )}

      {!natural && loaded && naturalVoices.length === 0 && (
        <div className="card">
          <h3>💡 Tu dispositivo no tiene voces naturales en inglés</h3>
          <p>Las voces actuales pueden sonar robóticas. Para una voz mucho más humana (gratis):</p>
          <ul>
            <li>
              <strong>Windows / cualquier PC:</strong> abre la app en <strong>Microsoft Edge</strong>. Trae voces “Natural” (Aria, Jenny,
              Guy, Andrew…) que suenan como personas.
            </li>
            <li>
              <strong>Chrome:</strong> usa la voz “Google US English” (necesita internet).
            </li>
            <li>
              <strong>iPhone / iPad / Mac:</strong> Ajustes → Accesibilidad → Contenido leído → Voces → Inglés, y descarga una voz
              “Mejorada” o “Premium” (por ejemplo Ava, Zoe o Evan). Luego recarga la app.
            </li>
            <li>
              <strong>Android:</strong> Ajustes → Idioma → Texto a voz → motor de Google → instala el paquete de inglés (EE. UU.) de alta
              calidad.
            </li>
          </ul>
        </div>
      )}
      {!natural && loaded && naturalVoices.length > 0 && (
        <div className="card">
          <p>
            ✅ Tienes {naturalVoices.length} voz
            {naturalVoices.length > 1 ? 'es' : ''} natural
            {naturalVoices.length > 1 ? 'es' : ''} en inglés. Consejo: escucha a velocidad natural (1×) para acostumbrarte al inglés real;
            usa 🐢 “Despacio” solo cuando lo necesites.
          </p>
        </div>
      )}
    </div>
  );
}
