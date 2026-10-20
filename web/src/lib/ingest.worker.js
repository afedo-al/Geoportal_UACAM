/* Web Worker de carga: lee y valida archivos fuera del hilo principal para
   que la página siga respondiendo con Shapefile o ZIP grandes.
   Protocolo:
     página → worker: { type: 'run', job } | { type: 'cancel', id } | { type: 'drop', id }
     worker → página: { id, type: 'progress', value } | { id, type: 'stage', state }
                      | { id, type: 'result', result } | { type: 'ready' } */
import { IngestCore } from './ingest-core.js';

self.onmessage = async ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'cancel') { IngestCore.cancel(data.id); return; }
  if (data.type === 'drop') { IngestCore.drop(data.id); return; }
  if (data.type !== 'run' || !data.job) return;
  const { job } = data;
  const result = await IngestCore.run(job, msg => self.postMessage({ id: job.id, ...msg }));
  if (!result) return; // cancelado
  const transfer = result.next?.buffer ? [result.next.buffer] : [];
  self.postMessage({ id: job.id, type: 'result', result }, transfer);
};

self.postMessage({ type: 'ready' });
