/* Chat filter: masks common insults and slurs (English, Turkish, Spanish)
   with asterisks, tolerating leetspeak and repeated letters. Deliberately
   small and word-based to avoid mangling normal words. */
const WORDS = [
  // English
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'bastard', 'asshole', 'cunt', 'dick', 'dickhead', 'retard', 'retarded', 'whore', 'slut', 'faggot', 'fag', 'nigger', 'nigga', 'kys', 'motherfucker', 'wanker', 'twat',
  // Turkish
  'amk', 'aq', 'orospu', 'piç', 'siktir', 'sik', 'yarrak', 'göt', 'gavat', 'ibne', 'pezevenk', 'amına', 'amina', 'orosbu', 'kahpe',
  // Spanish
  'puta', 'puto', 'mierda', 'cabron', 'cabrón', 'pendejo', 'gilipollas', 'coño', 'cono', 'joder', 'maricon', 'maricón', 'hijoputa', 'zorra',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const norm = w => w.toLowerCase().replace(/[013457@$!]/g, c => LEET[c]).replace(/(.)\1{2,}/g, '$1$1');
const BAD = new Set(WORDS.flatMap(w => [w, norm(w)]));
const squash = w => w.replace(/(.)\1+/g, '$1');
const BAD_SQUASHED = new Set([...BAD].map(squash));

export function filterChat(text) {
  return text.replace(/[\p{L}\p{N}@$!]+/gu, word => {
    const n = norm(word);
    return BAD.has(n) || BAD_SQUASHED.has(squash(n)) ? '*'.repeat(word.length) : word;
  });
}
