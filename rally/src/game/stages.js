// Stage catalogue shown in the menu. The geometry lives in stages/<id>.json.
// Target times are estimates from typical Rally2 average speeds on each kind
// of stage (not official results).

export const STAGES = [
  {
    id: 'turini',
    title: '콜 드 튀리니',
    sub: 'La Bollène-Vésubie → Col de Turini',
    rally: 'Rallye Monte-Carlo',
    flag: '🇫🇷',
    surface: 'tarmac',
    surfaceLabel: '아스팔트 · 살얼음',
    refSpeed: 82,
  },
  {
    id: 'ouninpohja',
    title: '우닌포흐야',
    sub: 'Ouninpohjantie, Jämsä',
    rally: 'Rally Finland',
    flag: '🇫🇮',
    surface: 'gravel',
    surfaceLabel: '고속 자갈',
    refSpeed: 118,
  },
  {
    id: 'vargasen',
    title: '바르고센',
    sub: "Colin's Crest, Värmland",
    rally: 'Rally Sweden',
    flag: '🇸🇪',
    surface: 'snow',
    surfaceLabel: '눈 · 스터드 타이어',
    refSpeed: 112,
  },
];
