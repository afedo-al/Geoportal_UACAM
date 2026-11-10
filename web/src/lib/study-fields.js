/* Campos del estudio de cada capa y sus listas de valores permitidos.
   Módulo sin dependencias: lo usa la interfaz y lo usará el servidor cuando exista, para que ambos
   validen contra las mismas opciones. */
export const THEMES = ['Hidrología', 'Suelos', 'Riesgos', 'Vegetación', 'Topografía', 'Clima', 'División territorial', 'Fauna', 'Levantamiento de campo'];
export const LICENSES = ['CC BY 4.0', 'CC BY-NC 4.0', 'CC BY-NC 2.5 MX', 'Uso restringido (solo CEDESU)'];
export const ACCESS = ['Pública', 'Interna'];

export const STUDY_FIELDS = ['sTitle', 'sTheme', 'sDate', 'sResp', 'sSource', 'sLic', 'sAccess', 'sDesc', 'sLineage', 'sKeywords'];
export const STUDY_REQ = ['sTitle', 'sTheme', 'sDate', 'sResp', 'sLic', 'sAccess'];
export const FIELD_LABELS = {
  sTitle: 'Título', sTheme: 'Tema', sDate: 'Fecha del estudio', sResp: 'Responsable', sSource: 'Fuente original',
  sLic: 'Licencia de uso', sAccess: 'Clasificación de acceso', sDesc: 'Descripción', sLineage: 'Procedencia y metodología', sKeywords: 'Palabras clave'
};
/* Longitud máxima de cada campo */
export const FIELD_MAX = { sTitle: 200, sTheme: 60, sDate: 10, sResp: 200, sSource: 500, sLic: 60, sAccess: 20, sDesc: 4000, sLineage: 4000, sKeywords: 500 };
