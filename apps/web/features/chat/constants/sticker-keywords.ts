// Typing suggestions for the bundled stickers: the words and emoji that make
// each one show up above the chat input. Vietnamese keywords are written
// without diacritics (the matcher normalizes both sides anyway). English
// keywords are matched for every viewer, because Vietnamese users often type
// "ok", "gym" or "love".
export interface StickerKeywords {
  vi: string[];
  en: string[];
  zh: string[];
  emoji: string[];
}

export const STICKER_KEYWORDS: Record<string, StickerKeywords> = {
  "flexed-biceps": {
    vi: ["co len", "manh len", "khoe", "suc manh", "co bap"],
    en: ["strong", "gym", "power", "muscle", "flex"],
    zh: ["加油", "肌肉", "力量", "强壮", "有力"],
    emoji: ["💪"],
  },
  "person-lifting-weights": {
    vi: ["nang ta", "tap ta", "di tap", "tap gym"],
    en: ["gym", "workout", "lift", "weights"],
    zh: ["举重", "健身", "举铁", "训练", "撸铁"],
    emoji: ["🏋️", "🏋"],
  },
  "running-shoe": {
    vi: ["chay bo", "di chay"],
    en: ["cardio", "run", "running"],
    zh: ["跑步", "慢跑", "有氧", "跑鞋"],
    emoji: ["👟", "🏃"],
  },
  stopwatch: {
    vi: ["nghi", "het gio", "dung gio", "tre", "doi xiu"],
    en: ["timer", "rest", "late"],
    zh: ["计时", "休息", "时间", "迟到"],
    emoji: ["⏱️", "⏱"],
  },
  trophy: {
    vi: ["chien thang", "vo dich", "thanh tich", "ky luc"],
    en: ["pr", "win", "winner", "champion"],
    zh: ["冠军", "胜利", "赢了", "纪录", "奖杯"],
    emoji: ["🏆"],
  },
  "1st-place-medal": {
    vi: ["so 1", "nhat", "dinh", "xuat sac"],
    en: ["top", "best", "first"],
    zh: ["第一", "金牌", "最棒", "最佳"],
    emoji: ["🥇"],
  },
  bullseye: {
    vi: ["muc tieu", "dat muc tieu", "chuan", "chinh xac"],
    en: ["goal", "target", "bullseye"],
    zh: ["目标", "达标", "命中", "准"],
    emoji: ["🎯"],
  },
  fire: {
    vi: ["chay", "qua dinh", "qua da"],
    en: ["hot", "fire", "lit"],
    zh: ["火", "太棒了", "火热", "燃"],
    emoji: ["🔥"],
  },
  rocket: {
    vi: ["len", "bung no", "tang toc", "nhanh"],
    en: ["let go", "go", "rocket", "launch"],
    zh: ["冲", "火箭", "出发", "加速"],
    emoji: ["🚀"],
  },
  "green-salad": {
    vi: ["salad", "rau", "an kieng", "an sach"],
    en: ["eat clean", "healthy", "salad"],
    zh: ["沙拉", "蔬菜", "健康饮食", "轻食"],
    emoji: ["🥗"],
  },
  avocado: {
    vi: ["bo", "chat beo tot"],
    en: ["avocado"],
    zh: ["牛油果", "鳄梨"],
    emoji: ["🥑"],
  },
  banana: {
    vi: ["chuoi", "an vat"],
    en: ["banana", "snack"],
    zh: ["香蕉", "零食"],
    emoji: ["🍌"],
  },
  broccoli: {
    vi: ["bong cai", "sup lo", "rau xanh"],
    en: ["broccoli", "greens"],
    zh: ["西兰花", "青菜", "绿色蔬菜"],
    emoji: ["🥦"],
  },
  "cut-of-meat": {
    vi: ["thit", "dam", "uc ga", "an thit", "bo"],
    en: ["protein", "meat", "steak"],
    zh: ["肉", "蛋白质", "牛排", "吃肉"],
    emoji: ["🥩", "🍖"],
  },
  droplet: {
    vi: ["uong nuoc", "nuoc", "khat", "mo hoi"],
    en: ["water", "hydrate", "sweat"],
    zh: ["喝水", "水", "口渴", "出汗"],
    emoji: ["💧"],
  },
  carrot: {
    vi: ["ca rot"],
    en: ["carrot"],
    zh: ["胡萝卜", "萝卜"],
    emoji: ["🥕"],
  },
  strawberry: {
    vi: ["dau", "dau tay", "trai cay"],
    en: ["strawberry", "fruit"],
    zh: ["草莓", "水果"],
    emoji: ["🍓"],
  },
  "glass-of-milk": {
    vi: ["sua"],
    en: ["whey", "milk"],
    zh: ["牛奶", "乳清", "奶"],
    emoji: ["🥛"],
  },
  "smiling-face-with-hearts": {
    vi: ["thuong", "yeu", "de thuong"],
    en: ["cute", "love", "adore"],
    zh: ["爱你", "喜欢", "可爱", "爱"],
    emoji: ["🥰"],
  },
  "face-with-tears-of-joy": {
    vi: ["haha", "hihi", "hehe", "buon cuoi", "cuoi"],
    en: ["lol", "kkk", "lmao", "funny"],
    zh: ["哈哈", "笑死", "好笑", "哈哈哈"],
    emoji: ["😂", "🤣"],
  },
  "star-struck": {
    vi: ["wow", "tuyet", "tuyet voi", "qua dep"],
    en: ["amazing", "wow", "awesome"],
    zh: ["哇", "太棒", "好厉害", "惊艳"],
    emoji: ["🤩"],
  },
  "smiling-face-with-sunglasses": {
    vi: ["ngau", "chat", "de"],
    en: ["cool", "ez", "easy"],
    zh: ["酷", "帅", "简单", "小意思"],
    emoji: ["😎"],
  },
  "partying-face": {
    vi: ["an mung", "chuc mung", "sinh nhat"],
    en: ["yeah", "yay", "party", "congrats", "celebrate"],
    zh: ["庆祝", "恭喜", "生日", "太好了"],
    emoji: ["🥳", "🎉"],
  },
  "face-with-steam-from-nose": {
    vi: ["tuc", "buc", "cay", "gian"],
    en: ["angry", "mad", "grr"],
    zh: ["生气", "气死", "愤怒", "不服"],
    emoji: ["😤", "😠"],
  },
  "exploding-head": {
    vi: ["soc", "khong tin noi", "vai"],
    en: ["wtf", "omg", "mind blown"],
    zh: ["震惊", "不会吧", "天哪", "炸了"],
    emoji: ["🤯"],
  },
  "sleeping-face": {
    vi: ["ngu", "buon ngu", "di ngu", "met", "ngu ngon"],
    en: ["good night", "sleep", "tired", "zzz"],
    zh: ["睡觉", "晚安", "困", "累了"],
    emoji: ["😴", "💤"],
  },
  "loudly-crying-face": {
    vi: ["khoc", "buon", "dau qua", "huhu", "hic", "doi qua"],
    en: ["cry", "sad", "sob"],
    zh: ["哭", "难过", "好疼", "呜呜", "饿了"],
    emoji: ["😭", "😢"],
  },
  "red-heart": {
    vi: ["tim", "yeu", "thuong qua", "iu"],
    en: ["love", "heart"],
    zh: ["爱", "爱心", "红心", "么么哒"],
    emoji: ["❤️", "❤", "♥️"],
  },
  "thumbs-up": {
    vi: ["oke", "okie", "duoc", "dong y", "u", "uh"],
    en: ["ok", "okay", "like", "good", "yes", "sure"],
    zh: ["好的", "可以", "赞", "同意", "没问题"],
    emoji: ["👍"],
  },
  "clapping-hands": {
    vi: ["gioi", "gioi qua", "hay", "tot lam"],
    en: ["bravo", "nice", "well done", "applause"],
    zh: ["鼓掌", "太棒了", "真棒", "做得好"],
    emoji: ["👏"],
  },
  "folded-hands": {
    vi: ["cam on", "xin", "nho"],
    en: ["thanks", "thank you", "tks", "please", "ty"],
    zh: ["谢谢", "感谢", "拜托", "请"],
    emoji: ["🙏"],
  },
};
