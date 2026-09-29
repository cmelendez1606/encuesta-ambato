/* Cuestionario del Estudio de Opinión Ciudadana Ambato.
 * Los IDs (P01_edad, etc.) deben coincidir con la lista PREGUNTAS de backend/Code.gs.
 * Las opciones de candidatos se cargan desde la hoja "Candidatos".
 */
const ESPECIALES_VOTO = [
  { id: '_NULO', label: 'Nulo', texto: 'Votaría nulo' },
  { id: '_BLANCO', label: 'Blanco', texto: 'Votaría en blanco' },
  { id: '_INDECISO', label: 'Indeciso', texto: 'Aún no decide' },
  { id: '_NR', label: 'No responde', texto: 'No responde' }
];
const LABELS_ESPECIALES = ESPECIALES_VOTO.map(e => e.label);

const NOMBRES_DIGNIDAD = {
  alcaldia: 'Alcaldía de Ambato',
  prefectura: 'Prefectura de Tungurahua',
  concejal_urbano: 'Concejalía urbana',
  concejal_rural: 'Concejalía rural'
};

function opcionesPapeleta(cfg, dignidad) {
  const cands = (cfg.candidatos || []).filter(c => c.dignidad === dignidad);
  return {
    aleatorias: cands.map(c => ({
      id: c.id, label: c.nombre,
      detalle: [c.organizacion, c.lista ? 'Lista ' + c.lista : ''].filter(Boolean).join(' · ')
    })),
    fijas: ESPECIALES_VOTO.map(e => ({ id: e.id, label: e.label, texto: e.texto, especial: true }))
  };
}

function simple(lista) { return lista.map(x => ({ id: x, label: x })); }

function construirCuestionario(cfg, brigadista) {
  const parroquias = cfg.parroquias || [];
  const zonaDe = nombre => (parroquias.find(p => p.nombre === nombre) || {}).zona || '';
  const hayCandidatos = d => (cfg.candidatos || []).filter(c => c.dignidad === d && !/^PENDIENTE/i.test(c.nombre)).length >= 2 || cfg.modoPrueba;
  const conocimiento = (cfg.candidatos || []).filter(c => c.medirConocimiento);

  return [
    {
      id: 'P01_edad', tipo: 'numero', min: 10, max: 110,
      texto: '¿Cuántos años cumplidos tiene usted?',
      terminaSi: v => Number(v) < 16 ? 'Menor de 16 años' : null
    },
    {
      id: 'P02_vota_ambato', tipo: 'unica',
      texto: '¿Usted vota en el cantón Ambato?',
      instruccion: 'Si vota en otro cantón, agradezca y termine.',
      opciones: simple(['Sí', 'No', 'No sabe']),
      terminaSi: v => v !== 'Sí' ? 'No vota en Ambato' : null
    },
    {
      id: 'P03_parroquia', tipo: 'parroquia',
      texto: '¿En qué parroquia vive usted?',
      opciones: parroquias.map(p => ({ id: p.nombre, label: p.nombre, detalle: p.zona })),
      porDefecto: brigadista && parroquias.some(p => p.nombre === brigadista.parroquia) ? brigadista.parroquia : ''
    },
    {
      id: 'P04_problemas', tipo: 'multiple', max: 2, aleatorio: true,
      texto: 'En su opinión, ¿cuáles son los DOS principales problemas de Ambato?',
      instruccion: 'Lea las opciones. Máximo dos.',
      opciones: simple(['Inseguridad y delincuencia', 'Falta de empleo', 'Vías y tránsito', 'Transporte público',
        'Agua potable y alcantarillado', 'Basura y limpieza', 'Comercio informal', 'Corrupción', 'Salud', 'Otro'])
    },
    {
      id: 'P05_gestion_municipal', tipo: 'unica',
      texto: '¿Cómo califica la gestión de la actual administración municipal de Ambato?',
      opciones: simple(['Muy buena', 'Buena', 'Regular', 'Mala', 'Muy mala', 'No sabe'])
    },
    {
      id: 'P06_alcaldia_espontanea', tipo: 'texto',
      texto: 'Si las elecciones fueran este domingo, ¿por quién votaría para ALCALDE de Ambato?',
      instruccion: 'NO muestre ni lea nombres. Escriba lo que diga la persona.',
      rapidas: ['No sabe', 'Ninguno', 'No responde']
    },
    {
      id: 'P07_alcaldia_inducida', tipo: 'papeleta', dignidad: 'alcaldia',
      texto: 'Le muestro la lista de candidatos a la ALCALDÍA. ¿Por cuál votaría?',
      instruccion: 'Gire el teléfono y deje que la persona lea la lista.',
      opciones: () => opcionesPapeleta(cfg, 'alcaldia')
    },
    {
      id: 'P08_alcaldia_seguridad', tipo: 'unica',
      texto: 'Esa decisión, ¿es definitiva o podría cambiar antes de la elección?',
      opciones: simple(['Definitiva', 'Podría cambiar']),
      mostrarSi: r => r.P07_alcaldia_inducida && !LABELS_ESPECIALES.includes(r.P07_alcaldia_inducida)
    },
    {
      id: 'P09_prefectura_espontanea', tipo: 'texto',
      texto: '¿Y por quién votaría para PREFECTO de Tungurahua?',
      instruccion: 'NO muestre ni lea nombres.',
      rapidas: ['No sabe', 'Ninguno', 'No responde']
    },
    {
      id: 'P10_prefectura_inducida', tipo: 'papeleta', dignidad: 'prefectura',
      texto: 'Estos son los candidatos a la PREFECTURA. ¿Por cuál votaría?',
      instruccion: 'Gire el teléfono y deje que la persona lea la lista.',
      opciones: () => opcionesPapeleta(cfg, 'prefectura')
    },
    {
      id: 'P11_concejal_inducida', tipo: 'papeleta',
      dignidad: r => zonaDe(r.P03_parroquia) === 'rural' ? 'concejal_rural' : 'concejal_urbano',
      texto: r => 'Para CONCEJAL ' + (zonaDe(r.P03_parroquia) === 'rural' ? 'RURAL' : 'URBANO') + ', ¿por cuál de estos candidatos votaría?',
      instruccion: 'Gire el teléfono y deje que la persona lea la lista.',
      opciones: r => opcionesPapeleta(cfg, zonaDe(r.P03_parroquia) === 'rural' ? 'concejal_rural' : 'concejal_urbano'),
      mostrarSi: r => hayCandidatos(zonaDe(r.P03_parroquia) === 'rural' ? 'concejal_rural' : 'concejal_urbano')
    },
    {
      id: 'P12_conocimiento', tipo: 'matriz', aleatorio: true,
      texto: '¿Ha escuchado hablar de las siguientes personas?',
      instruccion: 'Lea cada nombre y marque la respuesta.',
      filas: () => conocimiento.map(c => ({ id: c.id, label: c.nombre, detalle: NOMBRES_DIGNIDAD[c.dignidad] || '' })),
      columnas: ['Sí', 'No'],
      mostrarSi: () => conocimiento.length > 0
    },
    {
      id: 'P13_imagen', tipo: 'matriz', aleatorio: true,
      texto: 'De las personas que conoce, ¿qué opinión tiene de cada una?',
      filas: r => conocimiento.filter(c => r.P12_conocimiento && r.P12_conocimiento[c.nombre] === 'Sí')
        .map(c => ({ id: c.id, label: c.nombre, detalle: NOMBRES_DIGNIDAD[c.dignidad] || '' })),
      columnas: ['Buena', 'Mala', 'Ni buena ni mala'],
      mostrarSi: r => r.P12_conocimiento && Object.values(r.P12_conocimiento).includes('Sí')
    },
    {
      id: 'P14_sexo', tipo: 'unica',
      texto: 'Sexo de la persona entrevistada',
      opciones: simple(['Hombre', 'Mujer'])
    },
    {
      id: 'P15_educacion', tipo: 'unica',
      texto: '¿Cuál es su último nivel de estudios?',
      opciones: simple(['Ninguno o primaria', 'Secundaria / bachillerato', 'Técnico o tecnológico', 'Universitario', 'Posgrado'])
    },
    {
      id: 'P16_ocupacion', tipo: 'unica',
      texto: '¿A qué se dedica principalmente?',
      opciones: simple(['Empleado privado', 'Empleado público', 'Negocio propio / comerciante', 'Agricultura / ganadería',
        'Estudiante', 'Quehaceres del hogar', 'Jubilado', 'Desempleado', 'Otro'])
    },
    {
      id: 'TEL', tipo: 'telefono',
      texto: '¿Nos permite un número de teléfono? Solo se usará para que un supervisor confirme que esta encuesta se realizó.',
      instruccion: 'Es voluntario. Si no desea, marque "No desea dar teléfono".'
    }
  ];
}

/* Preguntas del cierre de campaña. Se muestran SOLO después de guardar y bloquear la encuesta. */
const PREGUNTAS_CIERRE = [
  { id: 'recibioMaterial', texto: '¿Recibió el material informativo?', opciones: ['Sí', 'No'] },
  { id: 'interes', texto: 'Reacción de la persona', opciones: ['Simpatizante', 'Quiere más información', 'Indeciso', 'No interesado'] },
  { id: 'aceptaPublicidad', texto: '¿Acepta un afiche o publicidad en su casa?', opciones: ['Sí', 'No'] },
  { id: 'voluntario', texto: '¿Le gustaría ser voluntario?', opciones: ['Sí', 'No'] },
  { id: 'autorizaContacto', texto: '¿Autoriza que le contactemos por WhatsApp?', opciones: ['Sí', 'No'] }
];
