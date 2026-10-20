import { html, useState, fmtTime, downloadBlob } from '../../lib.js';
import { state, busy, toast, projectVersion } from '../../core/store.js';
import { Btn, Section, Seg, Toggle } from '../controls.js';
import { exportMP4 } from '../../export/exporter.js';
import { captionGroups, toSRT } from '../../core/captions.js';
import { totalDuration } from '../../core/timeline.js';
import { player } from '../../engine/player.js';
import { captureFrame } from '../Preview.js';

const safeName = (s) => (s || 'video').replace(/[\\/:*?"<>|]+/g, '').trim() || 'video';

export function ExportPanel() {
  const p = state.project;
  const [res, setRes] = useState(1);
  const [fps, setFps] = useState(p.fps || 30);
  const [q, setQ] = useState('maxima');
  const [norm, setNorm] = useState(true);
  const dur = totalDuration(p);
  const W = Math.round(p.format.w * res), H = Math.round(p.format.h * res);
  const supported = 'VideoEncoder' in window;
  // Mbps para 1080p a 30 fps (a 60 fps ×1,5). Las redes recomprimen: cuanto mejor llegue, mejor se ve.
  const mbps = { maxima: 24, alta: 16, ligera: 8 }[q] * (fps > 30 ? 1.5 : 1);

  const run = async () => {
    player.pause();
    let handle = null;
    const name = safeName(p.name) + '.mp4';
    const PF = await import('../../core/projectFolder.js');
    if (!PF.folderActive() && window.showSaveFilePicker) {
      try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Vídeo MP4', accept: { 'video/mp4': ['.mp4'] } }] }); }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const ac = new AbortController();
    const b = { title: 'Exportando vídeo', text: 'Preparando…', progress: 0, cancel: () => ac.abort() };
    busy(b);
    try {
      const blob = await exportMP4({
        project: p, version: projectVersion, safeZone: state.ui.safeZone, scale: res, fps,
        bitrate: mbps * 1e6, normalize: norm, signal: ac.signal,
        onProgress: (pr, eta, text) => busy({ ...b, progress: pr, eta, text: `${text} ${Math.round(pr * 100)}%` }),
      });
      const stampName = name.replace(/\.mp4$/, `_${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.mp4`);
      const li = blob.info?.loud;
      const extra = li && isFinite(li.before) ? ` · audio ${li.before.toFixed(1).replace('.', ',')} → −14 LUFS` : '';
      if (PF.folderActive() && await PF.saveToFolder('Exportaciones', stampName, blob)) toast(`Exportado en la carpeta del proyecto › Exportaciones${extra}`, 'ok', 6000);
      else if (handle) { const w = await handle.createWritable(); await w.write(blob); await w.close(); toast('Vídeo exportado' + extra, 'ok', 6000); }
      else { downloadBlob(blob, name); toast('Vídeo exportado en Descargas' + extra, 'ok', 6000); }
    } catch (e) {
      if (e.name === 'AbortError') toast('Exportación cancelada', 'err');
      else { console.error(e); toast('Error al exportar: ' + e.message, 'err', 7000); }
    } finally { busy(null); }
  };

  return html`
    <div class="panel-head">
      <h2 class="panel-title">Exportar</h2>
      <p class="panel-desc">MP4 listo para subir a Reels, TikTok o Shorts, con subtítulos y motions integrados.</p>
    </div>
    <div class="panel-body">
      <${Section} title="Vídeo">
        <div class="stack">
          <div class="field"><span class="field-label">Resolución</span>
            <${Seg} value=${res} onChange=${setRes} options=${[[1, 'Full HD'], [2 / 3, 'HD 720p']]} /></div>
          <div class="field"><span class="field-label">Fotogramas por segundo</span>
            <${Seg} value=${fps} onChange=${setFps} options=${[[25, '25'], [30, '30'], [60, '60']]} /></div>
          <div class="field"><span class="field-label">Calidad</span>
            <${Seg} value=${q} onChange=${setQ} options=${[['maxima', 'Máxima'], ['alta', 'Alta'], ['ligera', 'Ligera']]} /></div>
          <${Toggle} label="Audio optimizado para redes" sub="Volumen a −14 LUFS (el de Instagram, TikTok y YouTube) con limitador: se oye claro y sin saturar" value=${norm} onChange=${setNorm} />
          <div class="note"><b>${W}×${H}</b> · ${fmtTime(dur)} · ${fps} fps · H.264 ${Math.round(mbps * res * res)} Mbps · AAC 48 kHz a la máxima calidad del navegador.<br/>Nitidez máxima: se decodifica el original a más resolución y se reduce con el escalado de mayor calidad. No cierres la pestaña mientras exporta.</div>
          ${!supported && html`<div class="note warn">Este navegador no permite exportar. Abre el editor en Google Chrome.</div>`}
          <${Btn} cls="cta lg" icon="download" disabled=${!p.clips.length || !supported} onClick=${run}>Exportar MP4</${Btn}>
        </div>
      </${Section}>
      <${Section} title="Extras">
        <div class="stack">
          <${Btn} icon="captions" disabled=${!Object.keys(p.transcripts).length} onClick=${() => {
            const srt = toSRT(captionGroups(p, projectVersion));
            downloadBlob(new Blob([srt], { type: 'text/plain;charset=utf-8' }), safeName(p.name) + '.srt');
          }}>Descargar subtítulos (.srt)</${Btn}>
          <${Btn} icon="camera" disabled=${!p.clips.length} onClick=${captureFrame}>Captura del fotograma actual (PNG)</${Btn}>
        </div>
      </${Section}>
    </div>`;
}
