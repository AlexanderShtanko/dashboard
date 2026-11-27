// Colour choices for cards and for the board background. Only the key is saved with the board;
// the actual tones live in style.css ([data-color] on a card, [data-bg] on <html>).
export const CARD_COLORS=[
  ['','Белый'],['yellow','Жёлтый'],['peach','Персиковый'],['pink','Розовый'],
  ['purple','Сиреневый'],['blue','Голубой'],['green','Зелёный'],['grey','Серый']
];
export const BOARD_BACKGROUNDS=[
  ['wallpaper','Обои'],['blue','Голубой'],['green','Зелёный'],['yellow','Песочный'],
  ['peach','Персиковый'],['pink','Розовый'],['purple','Сиреневый'],['grey','Серый'],['white','Светлый']
];
// Page colour for the browser toolbar (theme-color), per background.
export const BACKGROUND_THEME={wallpaper:'#e8eef7',blue:'#dbe7fb',green:'#dcefe3',yellow:'#f4ecd2',peach:'#f9e4d8',pink:'#f6e0e9',purple:'#e8e1f7',grey:'#e4e7ec',white:'#f8fafd'};
export const isColorKey=value=>typeof value==='string'&&/^[a-z]{1,20}$/.test(value);
const known=list=>new Set(list.map(([key])=>key));
const cards=known(CARD_COLORS),backgrounds=known(BOARD_BACKGROUNDS);
export const cardColor=value=>cards.has(value)?value:'';
// A board with no saved choice is grey; the wallpaper is a choice like any other.
export const DEFAULT_BACKGROUND='grey';
export const boardBackground=value=>backgrounds.has(value)?value:DEFAULT_BACKGROUND;
