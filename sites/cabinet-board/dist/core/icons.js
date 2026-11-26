// Original line icons: a consistent set without font-dependent Unicode glyphs.
const paths={
  note:['M5 4h9l5 5v11H5Z','M14 4v6h5','M8 14h8M8 17h5'],
  tasks:['M9 6h11M9 12h11M9 18h11','m3 6 1.5 1.5L7 4m-4 8 1.5 1.5L7 10m-4 8 1.5 1.5L7 16'],
  daily:['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7 3v4m10-4v4M3 10h18','m9 15 2 2 4-4'],
  folder:['M3 7V5h6l2 2h10v13H3Z'],
  links:['M9 15 15 9','M7 14H6a4 4 0 0 1 0-8h4a4 4 0 0 1 4 4v1','M17 10h1a4 4 0 0 1 0 8h-4a4 4 0 0 1-4-4v-1'],
  focus:['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18','M12 7v5l3 2'],
  savings:['M4 7h15a1 1 0 0 1 1 1v11H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2l12-2v4','M20 11h-6a2 2 0 0 0 0 4h6','M14 13h.01'],
  menu:['M4 6h16M4 12h16M4 18h16'],plus:['M12 5v14M5 12h14'],minus:['M5 12h14'],
  check:['m5 12 4 4L19 6'],expand:['M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5'],
  collapse:['M3 8h5V3M21 8h-5V3M16 21v-5h5M3 16h5v5'],
  close:['m6 6 12 12M18 6 6 18'],more:['M5 12h.01M12 12h.01M19 12h.01'],
  lock:['M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z','M8 10V7a4 4 0 0 1 8 0v3M12 14v2'],
  duplicate:['M9 9h11v11H9Z','M15 5V3H3v12h2'],front:['m7 10 5-5 5 5M12 5v14'],
  undo:['M8 4 3 9l5 5','M3 9h11a6 6 0 0 1 0 12'],
  move:['m8 6 4-4 4 4M12 2v20m-4-4 4 4 4-4M6 8l-4 4 4 4M2 12h20m-4-4 4 4-4 4'],
  play:['M8 5.5v13a.5.5 0 0 0 .77.42l10-6.5a.5.5 0 0 0 0-.84l-10-6.5A.5.5 0 0 0 8 5.5Z'],
  pause:['M9 5v14M15 5v14'],
  reset:['M4.5 12a7.5 7.5 0 1 0 2.2-5.3','M4 4v5h5'],
  edit:['M4 20h4L19 9l-4-4L4 16Z','m13.5 6.5 4 4'],
  trash:['M4 7h16','M10 11v6M14 11v6','M6 7l1 13h10l1-13','M9 7V4h6v3'],
  history:['M4 12a8 8 0 1 0 2.4-5.7','M4 4v4h4','M12 8v4l3 2'],
  sliders:['M4 7h9M17 7h3M4 17h3M11 17h9','M15 5v4M9 15v4'],
  'chevron-left':['m15 6-6 6 6 6'],'chevron-right':['m9 6 6 6-6 6'],'chevron-down':['m6 9 6 6 6-6'],
  'arrow-up':['M12 19V5m-6 6 6-6 6 6'],'arrow-down':['M12 5v14m-6-6 6 6 6-6'],
  open:['M14 4h6v6','M20 4 11 13','M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  unknown:['m12 3 9 9-9 9-9-9Z'],
};
export function icon(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  for(const d of paths[name]||paths.unknown){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}
