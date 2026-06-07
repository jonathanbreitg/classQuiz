// Parses a paragraph with [word] markers into segments and answers.
// Returns { segments, answers }
// segments: Array<{type:'text',text:string} | {type:'blank',index:number,answer:string}>
// answers: string[] in order of appearance
export function parseParagraph(text) {
  const segments = [];
  const answers = [];
  const regex = /\[([^\]]+)\]/g;
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', text: text.slice(last, m.index) });
    segments.push({ type: 'blank', index: answers.length, answer: m[1] });
    answers.push(m[1]);
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return { segments, answers };
}

export function normalizeWord(s) {
  return String(s).toLowerCase().replace(/[^a-z]/g, '');
}
