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
        <Link to="/">Home</Link> › Voice
      </nav>
      <section className="hero">
        <p className="eyebrow">Pronunciation</p>
        <h1>🔊 Voice settings</h1>
        <p className="hero__lead">
          By default the app uses a <strong>free neural voice (Kokoro)</strong> recorded for every word, phrase and dialogue in the course: it
          sounds human and is the same on every device. In dialogues, the second character has a different voice.
        </p>
      </section>

      <div className="card">
        <h3>Voice type</h3>
        <label className="toggle">
          <input type="radio" name="engine" checked={natural} onChange={() => update({ engine: 'natural' })} /> 🎙️ Natural course voice
          (recommended)
        </label>
        <br />
        <label className="toggle">
          <input type="radio" name="engine" checked={!natural} onChange={() => update({ engine: 'browser' })} /> 💻 My device's voice
        </label>
        {natural && audioCount === 0 && (
          <p className="muted">⚠️ Natural audio isn't available here yet; your device's voice is used in the meantime.</p>
        )}
        {natural && !!audioCount && <p className="muted">✅ {audioCount} natural audio clips available.</p>}
        <label className="field" style={{ marginTop: 12 }}>
          <span>
            Speed: {prefs.rate.toFixed(2)}× {prefs.rate === 1 ? '(natural)' : ''}
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
            ▶️ Test main voice
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => void speak(PARTNER_SAMPLE, { speaker: 1 })}>
            ▶️ Test second voice
          </button>
        </div>
      </div>

      {!natural && !canSpeak() && (
        <div className="card">
          <p>This browser can't read text out loud. Use the natural course voice or try Edge, Chrome or Safari.</p>
        </div>
      )}
      {!natural && canSpeak() && (
        <div className="card">
          <h3>Your device's voices</h3>
          <label className="field">
            <span>Main voice</span>
            <select className="input" value={prefs.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
              <option value="">
                Automatic (most natural
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
            <span>Second voice (the other character in dialogues)</span>
            <select className="input" value={prefs.partnerURI} onChange={(e) => update({ partnerURI: e.target.value })}>
              <option value="">Automatic</option>
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
          <h3>💡 Your device has no natural English voices</h3>
          <p>The current voices may sound robotic. For a much more human voice (free):</p>
          <ul>
            <li>
              <strong>Windows / any PC:</strong> open the app in <strong>Microsoft Edge</strong>. It ships “Natural” voices (Aria, Jenny, Guy,
              Andrew…) that sound like real people.
            </li>
            <li>
              <strong>Chrome:</strong> use the “Google US English” voice (needs internet).
            </li>
            <li>
              <strong>iPhone / iPad / Mac:</strong> Settings → Accessibility → Spoken Content → Voices → English, and download an “Enhanced” or
              “Premium” voice (e.g. Ava, Zoe or Evan). Then reload the app.
            </li>
            <li>
              <strong>Android:</strong> Settings → Language → Text-to-speech → Google engine → install the high-quality English (US) pack.
            </li>
          </ul>
        </div>
      )}
      {!natural && loaded && naturalVoices.length > 0 && (
        <div className="card">
          <p>
            ✅ You have {naturalVoices.length} natural English voice{naturalVoices.length > 1 ? 's' : ''}. Tip: listen at natural speed (1×)
            to get used to real English; use 🐢 “Slow” only when you need it.
          </p>
        </div>
      )}
    </div>
  );
}
