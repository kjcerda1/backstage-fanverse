// ─── MOCK DATA ─────────────────────────────────────────────────────────────────
export const ALL_GROUPS = ["BTS","Stray Kids","NewJeans","aespa","BLACKPINK","TXT","ENHYPEN","IVE","LE SSERAFIM","ITZY","NCT Dream","NCT 127","EXO","SHINee","GOT7","SEVENTEEN","ATEEZ","Red Velvet","TWICE","Kep1er","NMIXX","RIIZE","ZEROBASEONE","BABYMONSTER","BOYNEXTDOOR"];

// ─── KPOP BIAS CATALOG ─────────────────────────────────────────────────────────
// Separate from RESERVED_USERNAMES — username protection ≠ bias discovery.
export const KPOP_BIAS_CATALOG = [
  // Groups
  {id:"g-bts",displayName:"BTS",searchTerms:["bts","bangtan"],group:"BTS",type:"group"},
  {id:"g-skz",displayName:"Stray Kids",searchTerms:["stray kids","straykids","skz"],group:"Stray Kids",type:"group"},
  {id:"g-ateez",displayName:"ATEEZ",searchTerms:["ateez"],group:"ATEEZ",type:"group"},
  {id:"g-blackpink",displayName:"BLACKPINK",searchTerms:["blackpink","bp"],group:"BLACKPINK",type:"group"},
  {id:"g-aespa",displayName:"aespa",searchTerms:["aespa"],group:"aespa",type:"group"},
  {id:"g-newjeans",displayName:"NewJeans",searchTerms:["newjeans","new jeans","nj"],group:"NewJeans",type:"group"},
  {id:"g-txt",displayName:"TXT",searchTerms:["txt","tomorrow x together"],group:"TXT",type:"group"},
  {id:"g-enhypen",displayName:"ENHYPEN",searchTerms:["enhypen","enha"],group:"ENHYPEN",type:"group"},
  {id:"g-seventeen",displayName:"SEVENTEEN",searchTerms:["seventeen","svt"],group:"SEVENTEEN",type:"group"},
  {id:"g-twice",displayName:"TWICE",searchTerms:["twice"],group:"TWICE",type:"group"},
  {id:"g-ive",displayName:"IVE",searchTerms:["ive"],group:"IVE",type:"group"},
  {id:"g-lsf",displayName:"LE SSERAFIM",searchTerms:["le sserafim","lesserafim","lsf"],group:"LE SSERAFIM",type:"group"},
  {id:"g-itzy",displayName:"ITZY",searchTerms:["itzy"],group:"ITZY",type:"group"},
  {id:"g-nct",displayName:"NCT",searchTerms:["nct","nct127","nct dream"],group:"NCT",type:"group"},
  {id:"g-exo",displayName:"EXO",searchTerms:["exo"],group:"EXO",type:"group"},
  {id:"g-shinee",displayName:"SHINee",searchTerms:["shinee","shawol"],group:"SHINee",type:"group"},
  {id:"g-rv",displayName:"Red Velvet",searchTerms:["red velvet","rv","redvelvet"],group:"Red Velvet",type:"group"},
  {id:"g-riize",displayName:"RIIZE",searchTerms:["riize"],group:"RIIZE",type:"group"},
  {id:"g-zb1",displayName:"ZEROBASEONE",searchTerms:["zerobaseone","zb1","zero base one"],group:"ZEROBASEONE",type:"group"},
  {id:"g-bm",displayName:"BABYMONSTER",searchTerms:["babymonster","baby monster"],group:"BABYMONSTER",type:"group"},
  {id:"g-nmixx",displayName:"NMIXX",searchTerms:["nmixx"],group:"NMIXX",type:"group"},
  {id:"g-kep1er",displayName:"Kep1er",searchTerms:["kep1er","kepler"],group:"Kep1er",type:"group"},
  {id:"g-bnd",displayName:"BOYNEXTDOOR",searchTerms:["boynextdoor","boy next door","bnd"],group:"BOYNEXTDOOR",type:"group"},
  // BTS
  {id:"bts-rm",displayName:"RM",searchTerms:["rm","namjoon","kim namjoon","rapmonster"],group:"BTS",type:"idol"},
  {id:"bts-jin",displayName:"Jin",searchTerms:["jin","seokjin","kim seokjin"],group:"BTS",type:"idol"},
  {id:"bts-suga",displayName:"SUGA",searchTerms:["suga","yoongi","min yoongi","agust d","agustd"],group:"BTS",type:"idol"},
  {id:"bts-jhope",displayName:"j-hope",searchTerms:["jhope","j-hope","hoseok","jung hoseok"],group:"BTS",type:"idol"},
  {id:"bts-jimin",displayName:"Jimin",searchTerms:["jimin","park jimin"],group:"BTS",type:"idol"},
  {id:"bts-v",displayName:"V",searchTerms:["v","taehyung","kim taehyung"],group:"BTS",type:"idol"},
  {id:"bts-jk",displayName:"Jungkook",searchTerms:["jungkook","jk","jeon jungkook"],group:"BTS",type:"idol"},
  // ATEEZ
  {id:"atz-hj",displayName:"Hongjoong",searchTerms:["hongjoong","kim hongjoong","hongjoon","hongjong"],group:"ATEEZ",type:"idol"},
  {id:"atz-sh",displayName:"Seonghwa",searchTerms:["seonghwa","park seonghwa","sunghwa"],group:"ATEEZ",type:"idol"},
  {id:"atz-yh",displayName:"Yunho",searchTerms:["yunho","jeong yunho"],group:"ATEEZ",type:"idol"},
  {id:"atz-ys",displayName:"Yeosang",searchTerms:["yeosang","kang yeosang"],group:"ATEEZ",type:"idol"},
  {id:"atz-san",displayName:"San",searchTerms:["san","choi san"],group:"ATEEZ",type:"idol"},
  {id:"atz-mg",displayName:"Mingi",searchTerms:["mingi","song mingi"],group:"ATEEZ",type:"idol"},
  {id:"atz-wy",displayName:"Wooyoung",searchTerms:["wooyoung","jung wooyoung"],group:"ATEEZ",type:"idol"},
  {id:"atz-jh2",displayName:"Jongho",searchTerms:["jongho","choi jongho"],group:"ATEEZ",type:"idol"},
  // Stray Kids
  {id:"skz-bc",displayName:"Bang Chan",searchTerms:["bang chan","bangchan","chan","christopher bang"],group:"Stray Kids",type:"idol"},
  {id:"skz-lk",displayName:"Lee Know",searchTerms:["lee know","leeknow","minho","lee minho"],group:"Stray Kids",type:"idol"},
  {id:"skz-cb",displayName:"Changbin",searchTerms:["changbin","seo changbin"],group:"Stray Kids",type:"idol"},
  {id:"skz-hj",displayName:"Hyunjin",searchTerms:["hyunjin","hwang hyunjin"],group:"Stray Kids",type:"idol"},
  {id:"skz-han",displayName:"Han",searchTerms:["han","jisung","han jisung"],group:"Stray Kids",type:"idol"},
  {id:"skz-fl",displayName:"Felix",searchTerms:["felix","lee felix"],group:"Stray Kids",type:"idol"},
  {id:"skz-sm",displayName:"Seungmin",searchTerms:["seungmin","kim seungmin"],group:"Stray Kids",type:"idol"},
  {id:"skz-in",displayName:"I.N",searchTerms:["in","i.n","jeongin","yang jeongin"],group:"Stray Kids",type:"idol"},
  // BLACKPINK
  {id:"bp-js",displayName:"Jisoo",searchTerms:["jisoo","kim jisoo"],group:"BLACKPINK",type:"idol"},
  {id:"bp-je",displayName:"Jennie",searchTerms:["jennie","jennie kim"],group:"BLACKPINK",type:"idol"},
  {id:"bp-ro",displayName:"Rosé",searchTerms:["rose","rosé","roseanne","chaeyoung","park chaeyoung"],group:"BLACKPINK",type:"idol"},
  {id:"bp-li",displayName:"Lisa",searchTerms:["lisa","lalisa","lalisa manoban"],group:"BLACKPINK",type:"idol"},
  // aespa
  {id:"ae-ka",displayName:"Karina",searchTerms:["karina","yoo jimin","yu jimin"],group:"aespa",type:"idol"},
  {id:"ae-wi",displayName:"Winter",searchTerms:["winter","kim minjeong"],group:"aespa",type:"idol"},
  {id:"ae-gi",displayName:"Giselle",searchTerms:["giselle","aeri uchinaga"],group:"aespa",type:"idol"},
  {id:"ae-nn",displayName:"Ningning",searchTerms:["ningning","ning yizhuo"],group:"aespa",type:"idol"},
  // NewJeans
  {id:"nj-mj",displayName:"Minji",searchTerms:["minji","kim minji"],group:"NewJeans",type:"idol"},
  {id:"nj-ha",displayName:"Hanni",searchTerms:["hanni","pham ngoc han"],group:"NewJeans",type:"idol"},
  {id:"nj-da",displayName:"Danielle",searchTerms:["danielle","danielle marsh"],group:"NewJeans",type:"idol"},
  {id:"nj-hr",displayName:"Haerin",searchTerms:["haerin","kang haerin"],group:"NewJeans",type:"idol"},
  {id:"nj-hy",displayName:"Hyein",searchTerms:["hyein","lee hyein"],group:"NewJeans",type:"idol"},
  // TXT
  {id:"txt-sb",displayName:"Soobin",searchTerms:["soobin","choi soobin"],group:"TXT",type:"idol"},
  {id:"txt-yj",displayName:"Yeonjun",searchTerms:["yeonjun","choi yeonjun"],group:"TXT",type:"idol"},
  {id:"txt-bg",displayName:"Beomgyu",searchTerms:["beomgyu","choi beomgyu"],group:"TXT",type:"idol"},
  {id:"txt-th",displayName:"Taehyun",searchTerms:["taehyun","kang taehyun"],group:"TXT",type:"idol"},
  {id:"txt-hk",displayName:"Huening Kai",searchTerms:["huening kai","hueningkai"],group:"TXT",type:"idol"},
  // ENHYPEN
  {id:"en-jw",displayName:"Jungwon",searchTerms:["jungwon","yang jungwon"],group:"ENHYPEN",type:"idol"},
  {id:"en-hs",displayName:"Heeseung",searchTerms:["heeseung","lee heeseung"],group:"ENHYPEN",type:"idol"},
  {id:"en-jay",displayName:"Jay",searchTerms:["jay","park jongseong"],group:"ENHYPEN",type:"idol"},
  {id:"en-jk",displayName:"Jake",searchTerms:["jake","jake sim","sim jaeyun"],group:"ENHYPEN",type:"idol"},
  {id:"en-sh",displayName:"Sunghoon",searchTerms:["sunghoon","park sunghoon"],group:"ENHYPEN",type:"idol"},
  {id:"en-so",displayName:"Sunoo",searchTerms:["sunoo","kim sunoo"],group:"ENHYPEN",type:"idol"},
  {id:"en-ni",displayName:"Ni-ki",searchTerms:["niki","ni-ki","nishimura riki"],group:"ENHYPEN",type:"idol"},
  // SEVENTEEN
  {id:"svt-sc",displayName:"S.Coups",searchTerms:["scoups","s.coups","seungcheol","choi seungcheol"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-jh",displayName:"Jeonghan",searchTerms:["jeonghan","yoon jeonghan"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-jo",displayName:"Joshua",searchTerms:["joshua","hong jisoo","hong joshua"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-jun",displayName:"Jun",searchTerms:["jun","wen junhui"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-ho",displayName:"Hoshi",searchTerms:["hoshi","kwon soonyoung","soonyoung"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-ww",displayName:"Wonwoo",searchTerms:["wonwoo","jeon wonwoo"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-wz",displayName:"Woozi",searchTerms:["woozi","lee jihoon","jihoon"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-dk",displayName:"DK",searchTerms:["dk","dokyeom","lee seokmin","seokmin"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-mg",displayName:"Mingyu",searchTerms:["mingyu","kim mingyu"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-t8",displayName:"The8",searchTerms:["the8","minghao","xu minghao"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-sk",displayName:"Seungkwan",searchTerms:["seungkwan","boo seungkwan"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-ve",displayName:"Vernon",searchTerms:["vernon","chwe hansol","hansol"],group:"SEVENTEEN",type:"idol"},
  {id:"svt-di",displayName:"Dino",searchTerms:["dino","lee chan"],group:"SEVENTEEN",type:"idol"},
  // TWICE
  {id:"tw-ny",displayName:"Nayeon",searchTerms:["nayeon","im nayeon"],group:"TWICE",type:"idol"},
  {id:"tw-jy",displayName:"Jeongyeon",searchTerms:["jeongyeon","yoo jeongyeon"],group:"TWICE",type:"idol"},
  {id:"tw-mo",displayName:"Momo",searchTerms:["momo","hirai momo"],group:"TWICE",type:"idol"},
  {id:"tw-sa",displayName:"Sana",searchTerms:["sana","minatozaki sana"],group:"TWICE",type:"idol"},
  {id:"tw-ji",displayName:"Jihyo",searchTerms:["jihyo","park jihyo"],group:"TWICE",type:"idol"},
  {id:"tw-mi",displayName:"Mina",searchTerms:["mina","myoui mina"],group:"TWICE",type:"idol"},
  {id:"tw-da",displayName:"Dahyun",searchTerms:["dahyun","kim dahyun"],group:"TWICE",type:"idol"},
  {id:"tw-cy",displayName:"Chaeyoung",searchTerms:["chaeyoung","son chaeyoung"],group:"TWICE",type:"idol"},
  {id:"tw-tz",displayName:"Tzuyu",searchTerms:["tzuyu","chou tzuyu"],group:"TWICE",type:"idol"},
  // IVE
  {id:"ive-yj",displayName:"Yujin",searchTerms:["yujin","ahn yujin"],group:"IVE",type:"idol"},
  {id:"ive-ge",displayName:"Gaeul",searchTerms:["gaeul","kim gaeul"],group:"IVE",type:"idol"},
  {id:"ive-re",displayName:"Rei",searchTerms:["rei","naoi rei"],group:"IVE",type:"idol"},
  {id:"ive-wy",displayName:"Wonyoung",searchTerms:["wonyoung","jang wonyoung"],group:"IVE",type:"idol"},
  {id:"ive-li",displayName:"Liz",searchTerms:["liz","kim jiwon"],group:"IVE",type:"idol"},
  {id:"ive-ls",displayName:"Leeseo",searchTerms:["leeseo","lee hyewon"],group:"IVE",type:"idol"},
  // LE SSERAFIM
  {id:"lsf-sa",displayName:"Sakura",searchTerms:["sakura","miyawaki sakura"],group:"LE SSERAFIM",type:"idol"},
  {id:"lsf-cw",displayName:"Chaewon",searchTerms:["chaewon","kim chaewon"],group:"LE SSERAFIM",type:"idol"},
  {id:"lsf-yj",displayName:"Yunjin",searchTerms:["yunjin","huh yunjin"],group:"LE SSERAFIM",type:"idol"},
  {id:"lsf-kz",displayName:"Kazuha",searchTerms:["kazuha","nakamura kazuha"],group:"LE SSERAFIM",type:"idol"},
  {id:"lsf-ec",displayName:"Eunchae",searchTerms:["eunchae","hong eunchae"],group:"LE SSERAFIM",type:"idol"},
  // ITZY
  {id:"itzy-yj",displayName:"Yeji",searchTerms:["yeji","hwang yeji"],group:"ITZY",type:"idol"},
  {id:"itzy-li",displayName:"Lia",searchTerms:["lia","choi jisu"],group:"ITZY",type:"idol"},
  {id:"itzy-rj",displayName:"Ryujin",searchTerms:["ryujin","shin ryujin"],group:"ITZY",type:"idol"},
  {id:"itzy-cr",displayName:"Chaeryeong",searchTerms:["chaeryeong","lee chaeryeong"],group:"ITZY",type:"idol"},
  {id:"itzy-yn",displayName:"Yuna",searchTerms:["yuna","shin yuna"],group:"ITZY",type:"idol"},
  // NCT
  {id:"nct-ty",displayName:"Taeyong",searchTerms:["taeyong","lee taeyong"],group:"NCT",type:"idol"},
  {id:"nct-ta",displayName:"Taeil",searchTerms:["taeil","moon taeil"],group:"NCT",type:"idol"},
  {id:"nct-jn",displayName:"Johnny",searchTerms:["johnny","seo youngho"],group:"NCT",type:"idol"},
  {id:"nct-yt",displayName:"Yuta",searchTerms:["yuta","nakamoto yuta"],group:"NCT",type:"idol"},
  {id:"nct-dy",displayName:"Doyoung",searchTerms:["doyoung","kim dongyoung"],group:"NCT",type:"idol"},
  {id:"nct-te",displayName:"Ten",searchTerms:["ten","chittaphon"],group:"NCT",type:"idol"},
  {id:"nct-jh",displayName:"Jaehyun",searchTerms:["jaehyun","jung jaehyun"],group:"NCT",type:"idol"},
  {id:"nct-mk",displayName:"Mark",searchTerms:["mark","mark lee"],group:"NCT",type:"idol"},
  {id:"nct-jw",displayName:"Jungwoo",searchTerms:["jungwoo","kim jungwoo"],group:"NCT",type:"idol"},
  {id:"nct-rj",displayName:"Renjun",searchTerms:["renjun","huang renjun"],group:"NCT",type:"idol"},
  {id:"nct-je",displayName:"Jeno",searchTerms:["jeno","lee jeno"],group:"NCT",type:"idol"},
  {id:"nct-hc",displayName:"Haechan",searchTerms:["haechan","donghyuck","lee donghyuck"],group:"NCT",type:"idol"},
  {id:"nct-jm",displayName:"Jaemin",searchTerms:["jaemin","na jaemin"],group:"NCT",type:"idol"},
  {id:"nct-cl",displayName:"Chenle",searchTerms:["chenle","zhong chenle"],group:"NCT",type:"idol"},
  {id:"nct-js",displayName:"Jisung",searchTerms:["jisung","park jisung"],group:"NCT",type:"idol"},
];

export const searchBiasCatalog = (query) => {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  return KPOP_BIAS_CATALOG.filter(e =>
    e.displayName.toLowerCase().includes(q) ||
    e.searchTerms.some(t => t.includes(q))
  ).slice(0, 12);
};
