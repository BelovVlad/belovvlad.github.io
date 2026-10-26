// Results of the research directions, one list per direction (keys match
// data/directions.js). Only values exported from IBSimu runs go here: no demo
// or estimated numbers. An empty list means "not computed yet".
//
// Configuration record:
//   {
//     id: 'geometry-001',                     unique across all studies
//     label: 'Щель 2,0 мм',                    short name for the selector
//     inputs: { slit_width_mm: 2.0 },          varied parameters
//                                              (potentials: { electrode key: volts })
//     model: 'data/models/geometry-001.js',    geometry for the 3D view; null = baseline
//     run: '02_physics/results/<run>',         where the numbers come from
//     results: { emittance_mm_mrad: …, transmission: … },   computed characteristics
//   }
window.IBS_STUDIES = {
  geometry: { configurations: [] },
  potentials: { configurations: [] },
  alternatives: { configurations: [] },
};
