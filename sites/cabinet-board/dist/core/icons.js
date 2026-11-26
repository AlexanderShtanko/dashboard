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
  unknown:['m12 3 9 9-9 9-9-9Z'],
};
export function icon(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  for(const d of paths[name]||paths.unknown){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}
