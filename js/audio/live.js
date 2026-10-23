// Audio de la vista previa a través de Web Audio: cada <video>/<audio> del reproductor pasa por
// su cadena de corrección (FxChain), así la voz clara, los fundidos y el bajar la música se oyen
// al reproducir igual que en la exportación. Si el navegador no lo permite, el reproductor
// sigue usando el volumen de los propios elementos.
import { FxChain, loadWorklet, duckNode } from './fx.js';

class LiveAudio {
  constructor() {
    this.ctx = null;
    this.worklet = false;
    this.chains = new WeakMap();
    this.ready = null;
    // el contexto se crea con el primer gesto del usuario (los navegadores lo exigen)
    const first = () => { this.init(); window.removeEventListener('pointerdown', first, true); window.removeEventListener('keydown', first, true); };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
  }
  init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        const ctx = new Ctx({ latencyHint: 'interactive', sampleRate: 48000 });
        this.worklet = await loadWorklet(ctx);
        // limitador final: la vista previa nunca satura (al exportar se normaliza a −14 LUFS con su propio limitador)
        this.master = ctx.createDynamicsCompressor();
        this.master.threshold.value = -2; this.master.knee.value = 0; this.master.ratio.value = 20;
        this.master.attack.value = 0.002; this.master.release.value = 0.12;
        this.master.connect(ctx.destination);
        this.voiceBus = ctx.createGain();
        this.voiceBus.connect(this.master);
        this.ctx = ctx;
        return true;
      } catch (e) { console.warn('audio de la vista previa', e); return false; }
    })();
    return this.ready;
  }
  resume() {
    this.init();
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }
  get on() { return !!this.ctx; }
  // Cadena de un elemento (se crea una vez: un elemento solo se puede conectar a un contexto)
  chain(el) {
    if (!this.ctx || !el) return null;
    let ch = this.chains.get(el);
    if (ch === undefined) {
      try {
        const src = this.ctx.createMediaElementSource(el);
        ch = new FxChain(this.ctx, this.worklet);
        src.connect(ch.input);
        ch.output.connect(this.voiceBus);
        ch.ducked = 0;
        el.volume = 1; el.muted = false;
      } catch (e) { console.warn('cadena de audio', e); ch = null; }
      this.chains.set(el, ch);
    }
    return ch;
  }
  // Música que baja mientras se habla: su salida pasa por un nodo que escucha la voz
  setDuck(ch, amount) {
    const want = amount > 0.001 ? 1 : 0;
    if (!ch || ch.ducked === want) { if (ch?.duck) ch.duck.parameters.get('amount').value = amount; return; }
    if (want && !ch.duck) {
      ch.duck = duckNode(this.ctx, this.worklet);
      if (!ch.duck) return;
      this.voiceBus.connect(ch.duck, 0, 1);
      ch.duck.connect(this.master);
    }
    ch.output.disconnect();
    ch.output.connect(want ? ch.duck : this.voiceBus);
    if (ch.duck) ch.duck.parameters.get('amount').value = amount;
    ch.ducked = want;
  }
  // Volumen y fundido con una transición mínima (sin chasquidos)
  level(ch, vol, fade) {
    const t = this.ctx.currentTime;
    if (Math.abs((ch._vol ?? -1) - vol) > 1e-3) { ch.input.gain.setTargetAtTime(vol, t, 0.012); ch._vol = vol; }
    if (Math.abs((ch._fade ?? -1) - fade) > 1e-3) { ch.fade.gain.setTargetAtTime(fade, t, 0.012); ch._fade = fade; }
  }
}

export const liveAudio = new LiveAudio();
