/* Languages for the studio's videos. The commentator speaks English; titles, descriptions and
   closed captions also go out in these languages. Every phrase is an object of parallel
   translations, so a caption is the exact translation of the line that was spoken (the same
   template, the same variables). Game terms follow the game's own translations
   (client/i18n/*.js); champion and ability names stay as they are. */

export const LANGS = {
  en: { yt: 'en', name: 'English', locale: 'en' },
  es: { yt: 'es', name: 'Español', locale: 'es' },
  pt: { yt: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR' },
  tr: { yt: 'tr', name: 'Türkçe', locale: 'tr' },
  id: { yt: 'id', name: 'Bahasa Indonesia', locale: 'id' },
};
export const EXTRA_LANGS = ['es', 'pt', 'tr', 'id'];

/* Turkish case endings after a (foreign) name, by vowel harmony on its spelling:
   acc Garrok'u / Lyra'yı, gen Garrok'un / Lyra'nın, dat Garrok'a / Lyra'ya. */
const BACK = 'aıouAIOU', VOWELS = 'aeıioöuüAEIİOÖUÜ';
// Names whose ending is pronounced differently from how it's spelled (Thorne = "Torn").
const SAID = { Thorne: 'Torn' };
function harmony(name) {
  const word = SAID[name] || name;
  const v = [...word].reverse().find(c => VOWELS.includes(c)) || 'a';
  const lower = v.toLocaleLowerCase('tr');
  const four = { a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' }[lower] || 'ı';
  return { four, two: BACK.includes(v) ? 'a' : 'e', vowelEnd: VOWELS.includes(word.at(-1)) };
}
export const trCase = {
  acc: w => { const h = harmony(w); return `${w}'${h.vowelEnd ? 'y' : ''}${h.four}`; },
  gen: w => { const h = harmony(w); return `${w}'${h.vowelEnd ? 'n' : ''}${h.four}n`; },
  dat: w => { const h = harmony(w); return `${w}'${h.vowelEnd ? 'y' : ''}${h.two}`; },
};

/** Fills {name} and {name|filter|filter} (filters: cap, upper, lower; Turkish acc, gen, dat). */
export function fill(tpl, vars, lang = 'en') {
  const locale = LANGS[lang]?.locale || 'en';
  return tpl.replace(/\{(\w+)((?:\|\w+)*)\}/g, (_, k, filters) => {
    let v = vars[k];
    if (v === undefined || v === null) return '';
    v = String(v);
    for (const f of filters.split('|').filter(Boolean)) {
      if (f === 'cap') v = v.charAt(0).toLocaleUpperCase(locale) + v.slice(1);
      else if (f === 'upper') v = v.toLocaleUpperCase(locale);
      else if (f === 'lower') v = v.toLocaleLowerCase(locale);
      else if (lang === 'tr' && trCase[f]) v = trCase[f](v);
    }
    return v;
  });
}

/** A phrase in one language (English when it has no translation). */
export const tr = (phrase, lang) => (typeof phrase === 'string' ? phrase : phrase[lang] ?? phrase.en);

export const TEAM = {
  blue: { en: 'Blue', es: 'Azul', pt: 'Azul', tr: 'Mavi', id: 'Biru' },
  red: { en: 'Red', es: 'Rojo', pt: 'Vermelho', tr: 'Kırmızı', id: 'Merah' },
  none: { en: 'one team', es: 'un equipo', pt: 'uma equipe', tr: 'bir takım', id: 'satu tim' },
};

/* ---------------- commentary (spoken in English, captioned in all) ---------------- */
export const LEAD = {
  even: { en: "it's dead even at {n} apiece", es: 'empate a {n}', pt: 'tudo empatado em {n}', tr: 'skor {n}-{n} eşit', id: 'skor imbang {n}-{n}' },
  ahead: { en: '{team} leads {w} to {l}', es: '{team} gana {w} a {l}', pt: '{team} vence por {w} a {l}', tr: '{team} {w}-{l} önde', id: '{team} unggul {w}-{l}' },
};

export const LINES = {
  open: [
    { en: '{min} minutes in, {lead}. {a} and {b} are looking for something here.', es: 'Minuto {min}, {lead}. {a} y {b} buscan algo aquí.', pt: 'Minuto {min}, {lead}. {a} e {b} estão procurando alguma coisa aqui.', tr: '{min}. dakika, {lead}. {a} ve {b} burada bir şeyler arıyor.', id: 'Menit ke-{min}, {lead}. {a} dan {b} sedang mencari celah di sini.' },
    { en: 'Here we go — {a} is stalking {b}, and this could turn ugly fast.', es: '¡Aquí vamos! {a} acecha a {b}, y esto puede ponerse feo muy rápido.', pt: 'Lá vamos nós! {a} está caçando {b}, e isso pode ficar feio rapidinho.', tr: 'İşte başlıyoruz! {a}, {b|acc} takip ediyor; bu iş çabuk çirkinleşebilir.', id: 'Ini dia! {a} mengintai {b}, dan ini bisa cepat jadi kacau.' },
    { en: '{lead|cap} at {min} minutes. Watch {a} — this is where fights start.', es: '{lead|cap} en el minuto {min}. Atentos a {a}: aquí empiezan las peleas.', pt: '{lead|cap} aos {min} minutos. De olho em {a}: é aqui que as lutas começam.', tr: '{min}. dakikada {lead}. {a|dat} dikkat, kavgalar böyle başlar.', id: '{lead|cap} di menit ke-{min}. Perhatikan {a}, di sinilah pertarungan dimulai.' },
    { en: 'Things are heating up around {a}. {lead|cap}.', es: 'Se calienta la cosa alrededor de {a}. {lead|cap}.', pt: 'O clima esquenta perto de {a}. {lead|cap}.', tr: '{a} çevresinde ortam ısınıyor. {lead|cap}.', id: 'Situasi memanas di sekitar {a}. {lead|cap}.' },
    { en: 'Eyes on {a}. {b} is right there, and nobody is backing off.', es: 'Ojo con {a}. {b} está justo ahí y nadie retrocede.', pt: 'Olho em {a}. {b} está bem ali e ninguém recua.', tr: 'Gözler {a} üzerinde. {b} hemen orada ve kimse geri adım atmıyor.', id: 'Perhatikan {a}. {b} ada di sana, dan tak ada yang mundur.' },
  ],
  engage: [
    { en: '{c} goes in!', es: '¡{c} entra!', pt: '{c} entra com tudo!', tr: '{c} dalıyor!', id: '{c} masuk!' },
    { en: '{c} commits — here comes the fight!', es: '¡{c} se lanza, aquí viene la pelea!', pt: '{c} se joga, lá vem a luta!', tr: '{c} girdi, kavga geliyor!', id: '{c} nekat masuk, pertarungan dimulai!' },
    { en: 'And {c} starts it!', es: '¡Y {c} la empieza!', pt: 'E {c} começa!', tr: 'Ve {c} başlatıyor!', id: 'Dan {c} memulainya!' },
    { en: '{c} takes the first swing!', es: '¡{c} da el primer golpe!', pt: '{c} dá o primeiro golpe!', tr: 'İlk darbeyi {c} vuruyor!', id: '{c} memberi pukulan pertama!' },
  ],
  ult: [
    { en: '{ab} from {c}!', es: '¡{ab} de {c}!', pt: '{ab} de {c}!', tr: '{ab}! {c} kullandı!', id: '{ab} dari {c}!' },
    { en: '{c} with the {ab}!', es: '¡{c} con {ab}!', pt: '{c} com {ab}!', tr: '{c}, {ab} ile geliyor!', id: '{c} dengan {ab}!' },
    { en: 'Huge {ab} — {c} is all in!', es: '¡Enorme {ab}, {c} va con todo!', pt: 'Que {ab}! {c} vai com tudo!', tr: 'Dev bir {ab}! {c} her şeyini ortaya koyuyor!', id: '{ab} besar! {c} habis-habisan!' },
    { en: "There it is, {c}'s {ab}!", es: '¡Ahí está, {ab} de {c}!', pt: 'Aí está, {ab} de {c}!', tr: 'İşte geldi: {ab}, {c} imzalı!', id: 'Itu dia, {ab} milik {c}!' },
  ],
  flash: [
    { en: '{c} blinks in!', es: '¡{c} entra con Blink!', pt: '{c} entra de Blink!', tr: '{c} Blink ile içeride!', id: '{c} masuk pakai Blink!' },
    { en: '{c} with the blink!', es: '¡{c} usa Blink!', pt: '{c} usa o Blink!', tr: '{c} Blink attı!', id: '{c} pakai Blink!' },
  ],
  kill: [
    { en: '{k} takes down {v}!', es: '¡{k} derriba a {v}!', pt: '{k} derruba {v}!', tr: '{k}, {v|acc} indiriyor!', id: '{k} menjatuhkan {v}!' },
    { en: '{v} goes down to {k}!', es: '¡{v} cae ante {k}!', pt: '{v} cai para {k}!', tr: '{v}, {k} karşısında düşüyor!', id: '{v} tumbang oleh {k}!' },
    { en: '{k} finishes {v}!', es: '¡{k} remata a {v}!', pt: '{k} finaliza {v}!', tr: '{k}, {v|acc} bitiriyor!', id: '{k} menghabisi {v}!' },
    { en: 'And {v} is dead — {k} gets it!', es: '¡Y {v} muere, se lo lleva {k}!', pt: 'E {v} morre, quem pega é {k}!', tr: 'Ve {v} düştü, öldüren {k}!', id: 'Dan {v} tewas, {k} yang dapat!' },
    { en: '{k} picks off {v}!', es: '¡{k} caza a {v}!', pt: '{k} pega {v}!', tr: '{k}, {v|acc} avlıyor!', id: '{k} memburu {v}!' },
  ],
  killAssist: [
    { en: '{v} falls — {k} and {a} combine for it!', es: '¡{v} cae! ¡{k} y {a} lo consiguen juntos!', pt: '{v} cai! {k} e {a} fazem juntos!', tr: '{v} düşüyor! {k} ve {a} birlikte hallettiler!', id: '{v} tumbang! {k} dan {a} bekerja sama!' },
    { en: '{k} with {a} on {v}, gone!', es: '¡{k} con {a} sobre {v}, eliminado!', pt: '{k} com {a} em cima de {v}, já era!', tr: '{k} ve {a}, {v|acc} indirdi!', id: '{k} bersama {a} menghabisi {v}!' },
  ],
  killTower: [
    { en: 'The tower finishes {v}!', es: '¡La torre remata a {v}!', pt: 'A torre finaliza {v}!', tr: 'Kule, {v|acc} bitiriyor!', id: 'Menara menghabisi {v}!' },
    { en: '{v} dives too deep and the tower says no!', es: '¡{v} se mete demasiado y la torre dice que no!', pt: '{v} mergulha fundo demais e a torre diz não!', tr: '{v} çok derine daldı ve kule izin vermedi!', id: '{v} masuk terlalu dalam dan menara menolak!' },
  ],
  lowSurvive: [
    { en: '{c} is barely alive!', es: '¡{c} sigue vivo de milagro!', pt: '{c} está quase morto!', tr: '{c} zar zor ayakta!', id: '{c} nyaris mati!' },
    { en: '{c} on a sliver of health!', es: '¡{c} con un hilo de vida!', pt: '{c} com um fio de vida!', tr: '{c} çok az canla!', id: '{c} tinggal sedikit darah!' },
    { en: 'Can {c} survive this?!', es: '¿¡Puede {c} sobrevivir a esto!?', pt: '{c} consegue sobreviver a isso?!', tr: '{c} bundan kurtulabilecek mi?!', id: 'Bisakah {c} bertahan?!' },
  ],
  multi2: [
    { en: 'DOUBLE TAKEDOWN for {k}!', es: '¡DOBLE DERRIBO para {k}!', pt: 'ABATE DUPLO para {k}!', tr: '{k} için ÇİFTE ALAŞAĞI!', id: 'DOUBLE TAKEDOWN untuk {k}!' },
    { en: "That's TWO for {k}!", es: '¡Son DOS para {k}!', pt: 'São DOIS para {k}!', tr: '{k} ikinciyi aldı!', id: 'DUA untuk {k}!' },
  ],
  multi3: [
    { en: 'TRIPLE TAKEDOWN! {k} is unstoppable!', es: '¡TRIPLE DERRIBO! ¡{k} es imparable!', pt: 'ABATE TRIPLO! {k} é imparável!', tr: 'ÜÇLÜ ALAŞAĞI! {k} durdurulamıyor!', id: 'TRIPLE TAKEDOWN! {k} tak terhentikan!' },
    { en: 'THREE! {k} with the triple!', es: '¡TRES! ¡{k} se lleva el triple!', pt: 'TRÊS! {k} faz o triplo!', tr: 'ÜÇ! {k} üçlüyü yaptı!', id: 'TIGA! {k} dapat triple!' },
  ],
  multi4: [
    { en: 'QUADRA! {k} is taking over this game!', es: '¡CUÁDRUPLE! ¡{k} se adueña de la partida!', pt: 'QUÁDRUPLO! {k} está dominando o jogo!', tr: 'DÖRTLÜ ALAŞAĞI! {k} oyunu ele geçiriyor!', id: 'QUADRA! {k} menguasai pertandingan!' },
    { en: 'FOUR down — {k} is a monster!', es: '¡CUATRO! ¡{k} es un monstruo!', pt: 'QUATRO! {k} é um monstro!', tr: 'DÖRT! {k} tam bir canavar!', id: 'EMPAT! {k} benar-benar monster!' },
  ],
  multi5: [
    { en: 'PENTA! {k} WIPES THEM ALL!', es: '¡PENTA! ¡{k} ACABA CON TODOS!', pt: 'PENTA! {k} ACABA COM TODOS!', tr: 'PENTA! {k} HEPSİNİ SİLDİ!', id: 'PENTA! {k} MENGHABISI SEMUANYA!' },
    { en: 'FIVE! A TOTAL TAKEDOWN FOR {k}!', es: '¡CINCO! ¡DERRIBO TOTAL PARA {k}!', pt: 'CINCO! ABATE TOTAL PARA {k}!', tr: 'BEŞ! {k} İÇİN TAM ALAŞAĞI!', id: 'LIMA! TOTAL TAKEDOWN UNTUK {k}!' },
  ],
  team_wipe: [
    { en: 'TEAM WIPE! {team} cleans up everyone!', es: '¡EQUIPO ELIMINADO! ¡{team} limpia el mapa!', pt: 'EQUIPE ELIMINADA! {team} limpa todo mundo!', tr: 'TAKIM SİLİNDİ! {team} herkesi temizledi!', id: 'TIM HABIS! {team} membersihkan semuanya!' },
    { en: 'ACE! {team} leaves nobody standing!', es: '¡ACE! ¡{team} no deja a nadie en pie!', pt: 'ACE! {team} não deixa ninguém de pé!', tr: 'ACE! {team} ayakta kimseyi bırakmadı!', id: 'ACE! {team} tak menyisakan siapa pun!' },
  ],
  first_strike: [
    { en: 'First blood of the game!', es: '¡Primera sangre de la partida!', pt: 'Primeiro sangue da partida!', tr: 'Maçın ilk kanı!', id: 'First blood pertandingan!' },
    { en: "And that's first strike!", es: '¡Y eso es primera sangre!', pt: 'E é o primeiro sangue!', tr: 'Ve işte ilk kan!', id: 'Dan itu first blood!' },
  ],
  streak_end: [
    { en: 'SHUTDOWN! That streak is over!', es: '¡SHUTDOWN! ¡Se acabó la racha!', pt: 'SHUTDOWN! A sequência acabou!', tr: 'SHUTDOWN! Seri bitti!', id: 'SHUTDOWN! Rentetannya berakhir!' },
    { en: 'The streak is broken — shutdown gold!', es: '¡Racha rota, oro de shutdown!', pt: 'Sequência quebrada, ouro de shutdown!', tr: 'Seri kırıldı, shutdown altını!', id: 'Rentetan patah, emas shutdown!' },
  ],
  wyrm: [
    { en: '{team} takes the Ember Wyrm!', es: '¡{team} se lleva el Wyrm de Ascuas!', pt: '{team} pega o Wyrm de Brasa!', tr: "{team} Kor Ejderi'ni alıyor!", id: '{team} mengambil Ember Wyrm!' },
    { en: 'The Wyrm falls to {team}!', es: '¡El Wyrm cae ante {team}!', pt: 'O Wyrm cai para {team}!', tr: 'Ejder {team} takımına gidiyor!', id: 'Wyrm jatuh ke tangan {team}!' },
  ],
  titan: [
    { en: '{team} slays the Abyss Titan! Huge!', es: '¡{team} derrota al Titán del Abismo! ¡Enorme!', pt: '{team} derrota o Titã do Abismo! Enorme!', tr: "{team} Uçurum Titanı'nı kesiyor! Dev hamle!", id: '{team} mengalahkan Abyss Titan! Besar!' },
    { en: 'ABYSS TITAN to {team}!', es: '¡TITÁN DEL ABISMO para {team}!', pt: 'TITÃ DO ABISMO para {team}!', tr: 'UÇURUM TİTANI {team} takımının!', id: 'ABYSS TITAN untuk {team}!' },
  ],
  tower: [
    { en: '{team} takes the tower!', es: '¡{team} se lleva la torre!', pt: '{team} derruba a torre!', tr: '{team} kuleyi yıkıyor!', id: '{team} merebut menara!' },
    { en: 'And the tower comes down for {team}!', es: '¡Y cae la torre para {team}!', pt: 'E a torre cai para {team}!', tr: 'Ve kule {team} için düşüyor!', id: 'Dan menara runtuh untuk {team}!' },
  ],
  spire: [
    { en: 'The spire is down — juggernauts incoming!', es: '¡Cae la aguja! ¡Vienen los colosos!', pt: 'O pináculo caiu, lá vêm os colossos!', tr: 'Sütun yıkıldı, dev minyonlar geliyor!', id: 'Spire runtuh, juggernaut datang!' },
    { en: '{team} breaks the spire!', es: '¡{team} rompe la aguja!', pt: '{team} quebra o pináculo!', tr: '{team} sütunu yıkıyor!', id: '{team} menghancurkan spire!' },
  ],
  closeWin: [
    { en: '{team} wins that fight {w} for {l}!', es: '¡{team} gana esa pelea {w} a {l}!', pt: '{team} vence a luta por {w} a {l}!', tr: '{team} bu kavgayı {w}-{l} kazanıyor!', id: '{team} menang {w} lawan {l}!' },
    { en: 'What a fight — {team} comes out {w} for {l}!', es: '¡Qué pelea! ¡{team} sale {w} a {l}!', pt: 'Que luta! {team} sai {w} a {l}!', tr: 'Ne kavga! {team} {w}-{l} önde çıkıyor!', id: 'Pertarungan hebat, {team} unggul {w} lawan {l}!' },
    { en: "That's a {w}-for-{l} trade in favor of {team}!", es: '¡Intercambio {w} por {l} a favor de {team}!', pt: 'Troca de {w} por {l} a favor de {team}!', tr: '{team} lehine {w}-{l} bir takas!', id: 'Tukar {w} lawan {l} untuk {team}!' },
  ],
  closeEven: [
    { en: 'Even trade, {w} for {l} — nobody gives an inch!', es: '¡Intercambio parejo, {w} por {l}! ¡Nadie cede!', pt: 'Troca equilibrada, {w} por {l}! Ninguém cede!', tr: 'Eşit takas, {w}-{l}! Kimse geri adım atmıyor!', id: 'Tukar seimbang, {w} lawan {l}! Tak ada yang mengalah!' },
    { en: 'Bloody exchange, {w} apiece!', es: '¡Intercambio sangriento, {w} cada uno!', pt: 'Troca sangrenta, {w} para cada lado!', tr: 'Kanlı bir takas, {w}-{w}!', id: 'Saling bunuh, masing-masing {w}!' },
  ],
  closeStomp: [
    { en: '{team} wins it {w} for {l} — that could decide the game!', es: '¡{team} la gana {w} a {l}! ¡Eso puede decidir la partida!', pt: '{team} vence por {w} a {l}! Isso pode decidir o jogo!', tr: '{team} {w}-{l} kazanıyor! Bu maçı belirleyebilir!', id: '{team} menang {w} lawan {l}! Ini bisa menentukan pertandingan!' },
    { en: 'Clean sweep for {team}, {w} for {l}!', es: '¡Barrida limpia de {team}, {w} a {l}!', pt: 'Varrida limpa de {team}, {w} a {l}!', tr: '{team} için temiz bir süpürme, {w}-{l}!', id: 'Sapu bersih untuk {team}, {w} lawan {l}!' },
  ],
};

export const CARDS = {
  introOne: { en: 'One huge fight', es: 'Una pelea enorme', pt: 'Uma luta enorme', tr: 'Dev bir kavga', id: 'Satu pertarungan besar' },
  introMany: { en: '{nWord} huge fights, one wild match', es: '{n} peleas enormes, una partida salvaje', pt: '{n} lutas enormes, uma partida insana', tr: '{n} dev kavga, çılgın bir maç', id: '{n} pertarungan besar, satu pertandingan gila' },
  intro: { en: "Welcome to BroadRoads highlights! {what} — and wait till you see {star}. Let's go!", es: '¡Bienvenidos a los highlights de BroadRoads! {what}, y esperen a ver a {star}. ¡Vamos!', pt: 'Bem-vindos aos melhores momentos de BroadRoads! {what}, e esperem só para ver {star}. Vamos lá!', tr: "BroadRoads öne çıkanlarına hoş geldiniz! {what}; {star|acc} görene kadar bekleyin. Hadi başlayalım!", id: 'Selamat datang di highlight BroadRoads! {what}, dan tunggu sampai kalian lihat {star}. Ayo mulai!' },
  outro: { en: "That's the match! Play BroadRoads free in your browser at broadroads dot com — and subscribe for more fights like these!", es: '¡Eso es todo! Juega BroadRoads gratis en tu navegador en broadroads.com, ¡y suscríbete para ver más peleas así!', pt: 'É isso! Jogue BroadRoads de graça no navegador em broadroads.com, e se inscreva para ver mais lutas assim!', tr: "Maç bu kadar! BroadRoads'u tarayıcında ücretsiz oyna: broadroads.com. Daha fazla kavga için abone ol!", id: 'Itu dia pertandingannya! Main BroadRoads gratis di browser di broadroads.com, dan subscribe untuk pertarungan lainnya!' },
};
export const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five'];

/* ---------------- titles and descriptions ---------------- */
export const MOMENTS = {
  multi5: { en: 'TOTAL TAKEDOWN', es: 'DERRIBO TOTAL', pt: 'ABATE TOTAL', tr: 'TAM ALAŞAĞI', id: 'TOTAL TAKEDOWN' },
  multi4: { en: 'QUADRA TAKEDOWN', es: 'DERRIBO CUÁDRUPLE', pt: 'ABATE QUÁDRUPLO', tr: 'DÖRTLÜ ALAŞAĞI', id: 'QUADRA TAKEDOWN' },
  multi3: { en: 'TRIPLE TAKEDOWN', es: 'TRIPLE DERRIBO', pt: 'ABATE TRIPLO', tr: 'ÜÇLÜ ALAŞAĞI', id: 'TRIPLE TAKEDOWN' },
  team_wipe: { en: 'TEAM WIPE', es: 'EQUIPO ELIMINADO', pt: 'EQUIPE ELIMINADA', tr: 'TAKIM SİLİNDİ', id: 'TIM HABIS' },
  multi2: { en: 'DOUBLE TAKEDOWN', es: 'DOBLE DERRIBO', pt: 'ABATE DUPLO', tr: 'ÇİFTE ALAŞAĞI', id: 'DOUBLE TAKEDOWN' },
  titan: { en: 'ABYSS TITAN FIGHT', es: 'PELEA POR EL TITÁN', pt: 'LUTA PELO TITÃ', tr: 'TİTAN KAVGASI', id: 'PERTARUNGAN TITAN' },
  wyrm: { en: 'EMBER WYRM FIGHT', es: 'PELEA POR EL WYRM', pt: 'LUTA PELO WYRM', tr: 'EJDER KAVGASI', id: 'PERTARUNGAN WYRM' },
  streak_end: { en: 'SHUTDOWN', es: 'SHUTDOWN', pt: 'SHUTDOWN', tr: 'SHUTDOWN', id: 'SHUTDOWN' },
  spire: { en: 'SPIRE SIEGE', es: 'ASEDIO A LA AGUJA', pt: 'CERCO AO PINÁCULO', tr: 'SÜTUN KUŞATMASI', id: 'SERANGAN SPIRE' },
  tower: { en: 'TOWER DIVE', es: 'DIVE BAJO TORRE', pt: 'DIVE NA TORRE', tr: 'KULE DALIŞI', id: 'TOWER DIVE' },
  first_strike: { en: 'FIRST BLOOD', es: 'PRIMERA SANGRE', pt: 'PRIMEIRO SANGUE', tr: 'İLK KAN', id: 'FIRST BLOOD' },
  skirmish: { en: 'TEAMFIGHT', es: 'PELEA EN EQUIPO', pt: 'LUTA EM EQUIPE', tr: 'TAKIM KAVGASI', id: 'TEAMFIGHT' },
  pick: { en: 'OUTPLAYED', es: 'JUGADÓN', pt: 'JOGADAÇA', tr: 'USTALIK', id: 'OUTPLAYED' },
};

export const SHORT_TITLES = {
  multi5: [
    { en: '{star} gets a TOTAL TAKEDOWN 😱', es: '{star} consigue un DERRIBO TOTAL 😱', pt: '{star} faz um ABATE TOTAL 😱', tr: '{star} TAM ALAŞAĞI yaptı 😱', id: '{star} dapat TOTAL TAKEDOWN 😱' },
    { en: 'This {star} play is UNREAL (all 5!)', es: 'Esta jugada de {star} es IRREAL (¡los 5!)', pt: 'Essa jogada de {star} é SURREAL (todos os 5!)', tr: "Bu {star} oyunu GERÇEK DIŞI (5'i birden!)", id: 'Permainan {star} ini GILA (kelima-limanya!)' },
    { en: 'FIVE for {star}?! Insane BroadRoads teamfight', es: '¿¡CINCO para {star}!? Pelea de locos en BroadRoads', pt: 'CINCO para {star}?! Luta insana em BroadRoads', tr: '{star} için BEŞ mi?! Çılgın BroadRoads kavgası', id: 'LIMA untuk {star}?! Teamfight BroadRoads yang gila' },
  ],
  multi4: [
    { en: '{star} with a QUADRA in this teamfight 🔥', es: '{star} con un CUÁDRUPLE en esta pelea 🔥', pt: '{star} com um QUÁDRUPLO nessa luta 🔥', tr: '{star} bu kavgada DÖRTLÜ yaptı 🔥', id: '{star} dapat QUADRA di teamfight ini 🔥' },
    { en: '4 kills in seconds — {star} goes off', es: '4 kills en segundos: {star} se desata', pt: '4 abates em segundos: {star} enlouquece', tr: 'Saniyeler içinde 4 leş: {star} coştu', id: '4 kill dalam hitungan detik, {star} menggila' },
    { en: 'This {star} quadra is filthy', es: 'Este cuádruple de {star} es una locura', pt: 'Esse quádruplo de {star} é absurdo', tr: 'Bu {star} dörtlüsü inanılmaz', id: 'Quadra {star} ini parah banget' },
  ],
  multi3: [
    { en: '{star} TRIPLE TAKEDOWN — nobody survives', es: 'TRIPLE DERRIBO de {star}: nadie sobrevive', pt: 'ABATE TRIPLO de {star}: ninguém sobrevive', tr: '{star} ÜÇLÜ ALAŞAĞI: kimse sağ çıkmıyor', id: 'TRIPLE TAKEDOWN {star}, tak ada yang selamat' },
    { en: 'Triple kill {star} turns the whole fight', es: 'El triple de {star} le da la vuelta a la pelea', pt: 'O triplo de {star} vira a luta inteira', tr: '{star} üçlüsü bütün kavgayı çeviriyor', id: 'Triple kill {star} membalikkan pertarungan' },
    { en: '{star} just deleted three people 💀', es: '{star} acaba de borrar a tres 💀', pt: '{star} acabou de apagar três 💀', tr: '{star} az önce üç kişiyi sildi 💀', id: '{star} baru saja menghapus tiga orang 💀' },
  ],
  team_wipe: [
    { en: 'TEAM WIPE! {winner} leaves nobody standing', es: '¡EQUIPO ELIMINADO! {winner} no deja a nadie en pie', pt: 'EQUIPE ELIMINADA! {winner} não deixa ninguém de pé', tr: 'TAKIM SİLİNDİ! {winner} kimseyi ayakta bırakmadı', id: 'TIM HABIS! {winner} tak menyisakan siapa pun' },
    { en: 'They all died. Every single one.', es: 'Murieron todos. Todos y cada uno.', pt: 'Morreram todos. Cada um deles.', tr: 'Hepsi öldü. Tek tek.', id: 'Semuanya mati. Satu per satu.' },
    { en: "The cleanest ACE you'll see today", es: 'El ACE más limpio que verás hoy', pt: 'O ACE mais limpo que você vai ver hoje', tr: 'Bugün göreceğin en temiz ACE', id: 'ACE paling bersih yang akan kamu lihat hari ini' },
  ],
  titan: [
    { en: 'The Abyss Titan fight that decided everything', es: 'La pelea por el Titán del Abismo que lo decidió todo', pt: 'A luta pelo Titã do Abismo que decidiu tudo', tr: 'Her şeyi belirleyen Uçurum Titanı kavgası', id: 'Pertarungan Abyss Titan yang menentukan segalanya' },
    { en: 'Titan fight goes horribly wrong 😳', es: 'La pelea por el Titán sale fatal 😳', pt: 'A luta pelo Titã dá muito errado 😳', tr: 'Titan kavgası feci şekilde ters gidiyor 😳', id: 'Pertarungan Titan berakhir kacau 😳' },
  ],
  wyrm: [
    { en: 'Ember Wyrm fight turns into chaos', es: 'La pelea por el Wyrm se vuelve un caos', pt: 'A luta pelo Wyrm vira um caos', tr: 'Kor Ejderi kavgası kaosa dönüyor', id: 'Pertarungan Ember Wyrm jadi kacau' },
    { en: 'They fought over the Wyrm… and this happened', es: 'Pelearon por el Wyrm… y pasó esto', pt: 'Brigaram pelo Wyrm… e isso aconteceu', tr: 'Ejder için kapıştılar… ve bu oldu', id: 'Mereka berebut Wyrm… dan ini yang terjadi' },
  ],
  multi2: [
    { en: '{star} double takedown out of nowhere', es: 'Doble derribo de {star} salido de la nada', pt: 'Abate duplo de {star} do nada', tr: '{star} birden ÇİFTE ALAŞAĞI yaptı', id: 'Double takedown {star} entah dari mana' },
    { en: "{star} wins the 2v2 like it's nothing", es: '{star} gana el 2v2 como si nada', pt: '{star} vence o 2v2 como se não fosse nada', tr: "{star} 2v2'yi çantada keklik gibi aldı", id: '{star} menang 2v2 dengan santai' },
    { en: 'Did {star} just do that?!', es: '¿¡{star} acaba de hacer eso!?', pt: '{star} acabou de fazer isso?!', tr: '{star} bunu gerçekten yaptı mı?!', id: '{star} barusan beneran begitu?!' },
  ],
  streak_end: [
    { en: 'SHUTDOWN! {star} ends the streak', es: '¡SHUTDOWN! {star} corta la racha', pt: 'SHUTDOWN! {star} acaba com a sequência', tr: 'SHUTDOWN! {star} seriyi bitiriyor', id: 'SHUTDOWN! {star} menghentikan rentetan' },
    { en: 'That streak was not going to last…', es: 'Esa racha no iba a durar…', pt: 'Aquela sequência não ia durar…', tr: 'O seri zaten sürmeyecekti…', id: 'Rentetan itu memang tak akan bertahan…' },
  ],
  default: [
    { en: 'This {kills}-kill teamfight is pure chaos', es: 'Esta pelea de {kills} kills es puro caos', pt: 'Essa luta de {kills} abates é puro caos', tr: 'Bu {kills} leşli takım kavgası tam bir kaos', id: 'Teamfight {kills} kill ini benar-benar kacau' },
    { en: '{star} goes all in and THIS happens', es: '{star} va con todo y pasa ESTO', pt: '{star} vai com tudo e ACONTECE ISSO', tr: '{star} her şeyiyle giriyor ve BU oluyor', id: '{star} habis-habisan dan INI yang terjadi' },
    { en: 'Wait for the end of this fight 😳', es: 'Espera al final de esta pelea 😳', pt: 'Espere o final dessa luta 😳', tr: 'Bu kavganın sonunu bekle 😳', id: 'Tunggu akhir pertarungan ini 😳' },
    { en: '{won} teamfight — who wins?', es: 'Pelea {won}: ¿quién gana?', pt: 'Luta {won}: quem vence?', tr: '{won} takım kavgası: kim kazanır?', id: 'Teamfight {won}, siapa yang menang?' },
  ],
};

export const EPISODE_TITLES = {
  one: [
    { en: "{star}'s {moment|lower} — {total}-kill BroadRoads fight", es: '{moment|lower|cap} de {star}: pelea de {total} kills en BroadRoads', pt: '{moment|lower} de {star}: luta de {total} abates em BroadRoads', tr: '{moment}: {star} ile {total} leşli BroadRoads kavgası', id: '{moment|lower} {star}: pertarungan {total} kill di BroadRoads' },
    { en: '{moment}! {star} takes over this BroadRoads teamfight', es: '¡{moment}! {star} se adueña de esta pelea en BroadRoads', pt: '{moment}! {star} domina essa luta em BroadRoads', tr: '{moment}! {star} bu BroadRoads kavgasını ele geçiriyor', id: '{moment}! {star} menguasai teamfight BroadRoads ini' },
    { en: 'This BroadRoads teamfight had EVERYTHING ({moment|lower})', es: 'Esta pelea de BroadRoads lo tuvo TODO ({moment|lower})', pt: 'Essa luta de BroadRoads teve DE TUDO ({moment|lower})', tr: 'Bu BroadRoads kavgasında HER ŞEY vardı ({moment|lower})', id: 'Teamfight BroadRoads ini punya SEMUANYA ({moment|lower})' },
  ],
  many: [
    { en: "{star}'s {moment|lower} + {more} more insane fights | BroadRoads", es: '{moment|lower} de {star} y {more} peleas locas más | BroadRoads', pt: '{moment|lower} de {star} e mais {more} lutas insanas | BroadRoads', tr: '{moment}: {star} ve {more} çılgın kavga daha | BroadRoads', id: '{moment|lower} {star} + {more} pertarungan gila lainnya | BroadRoads', minFights: 3 },
    { en: '{moment}! {n} wild teamfights from one BroadRoads match', es: '¡{moment}! {n} peleas salvajes de una partida de BroadRoads', pt: '{moment}! {n} lutas insanas de uma partida de BroadRoads', tr: '{moment}! Tek bir BroadRoads maçından {n} vahşi kavga', id: '{moment}! {n} teamfight liar dari satu pertandingan BroadRoads' },
    { en: '{total} kills, {n} fights, one {moment|lower} — BroadRoads highlights', es: '{total} kills y {n} peleas: highlights de BroadRoads ({moment|lower})', pt: '{total} abates e {n} lutas: melhores momentos de BroadRoads ({moment|lower})', tr: '{total} leş, {n} kavga: BroadRoads öne çıkanlar ({moment|lower})', id: '{total} kill, {n} pertarungan: highlight BroadRoads ({moment|lower})' },
    { en: 'This BroadRoads match had EVERYTHING ({moment|lower})', es: 'Esta partida de BroadRoads lo tuvo TODO ({moment|lower})', pt: 'Essa partida de BroadRoads teve DE TUDO ({moment|lower})', tr: 'Bu BroadRoads maçında HER ŞEY vardı ({moment|lower})', id: 'Pertandingan BroadRoads ini punya SEMUANYA ({moment|lower})' },
  ],
};

export const DESC = {
  bestOne: { en: 'The best fight from one BroadRoads 5v5 match, with live commentary.', es: 'La mejor pelea de una partida 5v5 de BroadRoads, con comentarios en directo.', pt: 'A melhor luta de uma partida 5v5 de BroadRoads, com narração ao vivo.', tr: 'Bir BroadRoads 5v5 maçının en iyi kavgası, canlı anlatımla.', id: 'Pertarungan terbaik dari satu pertandingan 5v5 BroadRoads, dengan komentar langsung.' },
  bestMany: { en: 'The best fights from one BroadRoads 5v5 match, with live commentary.', es: 'Las mejores peleas de una partida 5v5 de BroadRoads, con comentarios en directo.', pt: 'As melhores lutas de uma partida 5v5 de BroadRoads, com narração ao vivo.', tr: 'Bir BroadRoads 5v5 maçının en iyi kavgaları, canlı anlatımla.', id: 'Pertarungan terbaik dari satu pertandingan 5v5 BroadRoads, dengan komentar langsung.' },
  won: { en: '{team} won {a}–{b} in {min} minutes.', es: 'Ganó {team} {a}–{b} en {min} minutos.', pt: '{team} venceu por {a}–{b} em {min} minutos.', tr: '{team} {min} dakikada {a}–{b} kazandı.', id: '{team} menang {a}–{b} dalam {min} menit.' },
  intro: { en: 'Intro', es: 'Intro', pt: 'Abertura', tr: 'Giriş', id: 'Pembuka' },
  chapter: { en: 'Fight {n} — {star}: {moment|lower} ({time})', es: 'Pelea {n}: {star}, {moment|lower} ({time})', pt: 'Luta {n}: {star}, {moment|lower} ({time})', tr: '{n}. kavga: {star}, {moment|lower} ({time})', id: 'Pertarungan {n}: {star}, {moment|lower} ({time})' },
  outro: { en: 'Play BroadRoads free', es: 'Juega BroadRoads gratis', pt: 'Jogue BroadRoads de graça', tr: "BroadRoads'u ücretsiz oyna", id: 'Main BroadRoads gratis' },
  blue: { en: '🔵 Blue: {list}', es: '🔵 Azul: {list}', pt: '🔵 Azul: {list}', tr: '🔵 Mavi: {list}', id: '🔵 Biru: {list}' },
  red: { en: '🔴 Red: {list}', es: '🔴 Rojo: {list}', pt: '🔴 Vermelho: {list}', tr: '🔴 Kırmızı: {list}', id: '🔴 Merah: {list}' },
  cta: { en: '▶ Play BroadRoads free in your browser — no download: {site}', es: '▶ Juega BroadRoads gratis en tu navegador, sin descargas: {site}', pt: '▶ Jogue BroadRoads de graça no navegador, sem download: {site}', tr: "▶ BroadRoads'u tarayıcında ücretsiz oyna, indirme yok: {site}", id: '▶ Main BroadRoads gratis di browser, tanpa unduhan: {site}' },
  ctaShort: { en: 'Play BroadRoads free in your browser: {site}', es: 'Juega BroadRoads gratis en tu navegador: {site}', pt: 'Jogue BroadRoads de graça no navegador: {site}', tr: "BroadRoads'u tarayıcında ücretsiz oyna: {site}", id: 'Main BroadRoads gratis di browser: {site}' },
  full: { en: 'Full match highlights: {url}', es: 'Partida completa: {url}', pt: 'Partida completa: {url}', tr: 'Maçın tamamı: {url}', id: 'Highlight lengkap: {url}' },
  shortFacts: { en: '{moment} — {star} and {others} in a {kills}-kill fight at {time}.', es: '{moment}: {star} y {others} en una pelea de {kills} kills en el {time}.', pt: '{moment}: {star} e {others} numa luta de {kills} abates aos {time}.', tr: '{moment}: {star} ve {others}, {time} anında {kills} leşli bir kavgada.', id: '{moment}: {star} dan {others} dalam pertarungan {kills} kill di menit {time}.' },
  disclosure: { en: 'Gameplay is a real BroadRoads match between AI-controlled champions, recorded from the in-game spectator. Commentary is voiced with AI (ElevenLabs).', es: 'El gameplay es una partida real de BroadRoads entre campeones controlados por IA, grabada desde el modo espectador. Los comentarios (en inglés) usan una voz de IA (ElevenLabs); activa los subtítulos en español.', pt: 'O gameplay é uma partida real de BroadRoads entre campeões controlados por IA, gravada do modo espectador. A narração (em inglês) usa uma voz de IA (ElevenLabs); ative as legendas em português.', tr: 'Oynanış, yapay zekâ kontrolündeki şampiyonlar arasında gerçek bir BroadRoads maçıdır ve izleyici modundan kaydedilmiştir. Anlatım yapay zekâ sesiyle (ElevenLabs) İngilizcedir; Türkçe altyazıyı açabilirsin.', id: 'Gameplay adalah pertandingan BroadRoads sungguhan antara champion yang dikendalikan AI, direkam dari mode penonton. Komentar (bahasa Inggris) memakai suara AI (ElevenLabs); nyalakan subtitle bahasa Indonesia.' },
  disclosureShort: { en: 'Commentary voiced with AI (ElevenLabs) over real BroadRoads gameplay (bot match).', es: 'Comentarios en inglés con voz de IA (ElevenLabs) sobre gameplay real de BroadRoads (partida de bots). Activa los subtítulos.', pt: 'Narração em inglês com voz de IA (ElevenLabs) sobre gameplay real de BroadRoads (partida de bots). Ative as legendas.', tr: 'Gerçek BroadRoads oynanışı (bot maçı) üzerinde yapay zekâ sesiyle (ElevenLabs) İngilizce anlatım. Altyazıyı açabilirsin.', id: 'Komentar bahasa Inggris dengan suara AI (ElevenLabs) di atas gameplay BroadRoads asli (pertandingan bot). Nyalakan subtitle.' },
};

/** A few search tags per language (tags are not localized on YouTube, so they share one list). */
export const LANG_TAGS = { es: ['juego MOBA', 'MOBA gratis'], pt: ['jogo MOBA', 'MOBA grátis'], tr: ['MOBA oyunu', 'ücretsiz oyun'], id: ['game MOBA', 'MOBA gratis'] };
