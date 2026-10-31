/* i18n — ja / en / zh. Flat keys, {param} templates. */
(function (global) {
  'use strict';

  var LANGS = ['ja', 'en', 'zh'];
  var LANG_NAME = { ja: '日本語', en: 'English', zh: '中文' };
  var HTML_LANG = { ja: 'ja', en: 'en', zh: 'zh-CN' };

  var STR = {
    ja: {
      'title.a': '灰燼の塔',
      'title.b': 'EMBER SPIRE',
      'title.tag': '塔の底には、消えた灯が眠る。',
      'title.hint': '画面をタップして開始',
      'title.best': '最深 {n}階',

      'menu.new': '新たな冒険',
      'menu.cont': '続きから',
      'menu.records': '記録',
      'menu.help': '遊び方',
      'menu.settings': '設定',

      'common.close': '閉じる',
      'common.back': 'もどる',

      'set.sound': 'サウンド',
      'set.lang': '言語 / Language',
      'set.data': 'セーブデータ',
      'set.del': 'データを削除',
      'set.delSure': 'セーブデータと記録を消しますか？',
      'set.on': 'ON',
      'set.off': 'OFF',
      'set.hint': '進行は端末内に自動保存されます',

      'rec.title': '冒険の記録',
      'rec.best': '最も深く進んだ階層',
      'rec.deepest': '最期の階層',
      'rec.runs': '挑戦回数',
      'rec.kills': '討伐数',
      'rec.gold': '累計ゴールド',
      'rec.none': 'まだ記録はありません',

      'hud.floor': 'B{n}階',
      'hud.lv': 'Lv',
      'hud.exp': 'EXP',
      'hud.hp': '体力',
      'hud.mp': '魔力',
      'hud.atk': '攻撃',
      'hud.def': '防御',
      'hud.gold': '金',
      'hud.key': '鍵',
      'hud.turn': 'ターン',
      'hud.weapon': '武器',
      'hud.armor': '鎧',

      'btn.skill': '火の玉',
      'btn.potion': '薬',
      'btn.rest': '休む',
      'btn.pause': 'メニュー',

      'help.title': '遊び方',
      'help.h1': '移動',
      'help.t1': '十字キー、矢印/WASD、スワイプ、または画面タップ。見えていない場所は暗闇に包まれる。',
      'help.h2': '戦闘',
      'help.t2': '敵のマスへ入れば攻撃。火の玉は視界内の最も近い敵へ飛ぶ。休むと魔力が戻るが、敵が近づくこともある。',
      'help.h3': '探索',
      'help.t3': '宝箱には武器・鎧・鍵・gold。錠の扉は鍵で開く。床の罠は踏むまで見えない。階段を見つけて降りよう。',
      'help.h4': '目標',
      'help.t4': 'B10階で灰燼竜を倒せば塔の宝を手にできる。倒れたら冒険は終わり — 記録だけが残り、新しい勇者が立つ。',

      'pause.title': 'ポーズ',
      'pause.resume': '再開',
      'pause.save': '今セーブする',
      'pause.titleBtn': 'タイトルへ',
      'pause.settings': '設定',
      'pause.help': '遊び方',

      'over.dTitle': '灯が消えた',
      'over.dBody': '{name}の手で、あなたはB{f}階に倒れた。',
      'over.dark': '暗闇そのもの',
      'over.retry': 'もう一度挑む',
      'over.toTitle': 'タイトルへ',

      'over.vTitle': '塔の宝',
      'over.vBody': '灰燼竜を破り、B{f}階で塔の宝を手にした。',
      'over.deeper': 'さらに深く',
      'over.retire': '冒険を終える',

      'toast.saved': '保存しました',
      'toast.loaded': '続きを開始しました',
      'toast.noSave': 'セーブデータがありません',
      'toast.del': 'データを削除しました',
      'toast.sndOn': 'サウンド ON',
      'toast.sndOff': 'サウンド OFF',
      'toast.lang': '言語を切り替えました',
      'toast.quit': 'タイトルに戻りました',

      'item.potion': '薬草',
      'item.gold': 'gold',
      'item.key': '鍵',
      'item.chest': '宝箱',
      'item.stairs': '階段',
      'item.wpn0': '錆びた剣',
      'item.wpn1': '鉄の剣',
      'item.wpn2': '鋼の剣',
      'item.wpn3': '刻印の刃',
      'item.wpn4': '灰燼の牙',
      'item.arm0': '布の服',
      'item.arm1': '革の鎧',
      'item.arm2': '鎖かたびら',
      'item.arm3': '護りの板金',

      'mon.slime': 'スライム',
      'mon.beetle': '甲虫',
      'mon.bat': 'コウモリ',
      'mon.goblin': 'ゴブリン',
      'mon.skeleton': 'スケルトン',
      'mon.ooze': 'オウズ',
      'mon.spider': '大型蜘蛛',
      'mon.wraith': '亡霊',
      'mon.imp': 'インプ',
      'mon.brigand': '山賊',
      'mon.knight': '鉄騎士',
      'mon.mimic': 'ミミック',
      'mon.dragon': '灰燼竜',
      'mon.elder': '古灰燼竜',

      'msg.floor': 'B{n}階に降りた。',
      'msg.floorHint': '階段を探して、さらに深くへ。',
      'msg.potion': '{n}を拾った。',
      'msg.gold': 'gold +{n}',
      'msg.key': '鍵を拾った。',
      'msg.wpn': '{n}を見つけた。',
      'msg.wpnBetter': '{n}を装備（攻撃+{v}）。',
      'msg.armBetter': '{n}を装備（防御+{v}）。',
      'msg.wpnKeep': '{n}は持ち主を待っている。{cur}の方が良い。',
      'msg.chest': '宝箱を開けた。',
      'msg.chestEmpty': '宝箱は空だった。',
      'msg.mimicReveal': '宝箱が身を起こした！',
      'msg.locked': '錠が下りている — 鍵が必要。',
      'msg.useKey': '鍵で扉を開けた。',
      'msg.trap': '罠を踏んだ！ {n}のダメージ。',
      'msg.hit': '{name}に{n}のダメージ。',
      'msg.crit': '急所！ {name}に{n}のダメージ。',
      'msg.miss': '攻撃が空を切った。',
      'msg.kill': '{name}を倒した。',
      'msg.hurt': '{name}に{n}削られた。',
      'msg.dodge': '攻撃をかわした。',
      'msg.steal': '{name}にgold {n}を奪われた。',
      'msg.noMp': '魔力が足りない。',
      'msg.noTarget': '視界に敵が見えない。',
      'msg.noPotion': '薬を持っていない。',
      'msg.heal': '体力が{n}戻った。',
      'msg.fullHp': '体力は満タン。',
      'msg.fullMp': '魔力は満タン。',
      'msg.rest': '息を整えた（魔力+1）。',
      'msg.ambush': '暗闇から物音がした…！',
      'msg.levelUp': 'レベル{n}に到達！ 傷が癒える。',
      'msg.bossWarn': '灼熱の吐息。灰燼竜が目覚めた。',
      'msg.bossDown': '灰燼竜は崩れ、塔の宝が転がり落ちた。',
      'msg.crowned': '塔の宝を手にした。',
      'msg.newRecord': '◆ 新記録！',
      'msg.died': '{name}の手で倒れた。',
      'msg.deeper': 'さらに深い層へ。塔は息を荒げる。',
      'msg.saveFail': '保存できませんでした'
    },

    en: {
      'title.a': 'EMBER SPIRE',
      'title.b': '灰燼の塔',
      'title.tag': 'Beneath the spire sleep the lanterns that went out.',
      'title.hint': 'Tap to begin',
      'title.best': 'Deepest: B{n}',

      'menu.new': 'New Run',
      'menu.cont': 'Continue',
      'menu.records': 'Records',
      'menu.help': 'How to Play',
      'menu.settings': 'Settings',

      'common.close': 'Close',
      'common.back': 'Back',

      'set.sound': 'Sound',
      'set.lang': 'Language',
      'set.data': 'Save Data',
      'set.del': 'Delete data',
      'set.delSure': 'Delete save data and records?',
      'set.on': 'ON',
      'set.off': 'OFF',
      'set.hint': 'Progress autosaves on this device',

      'rec.title': 'Adventurer’s Record',
      'rec.best': 'Deepest floor reached',
      'rec.deepest': 'Floor where you fell',
      'rec.runs': 'Runs attempted',
      'rec.kills': 'Monsters slain',
      'rec.gold': 'Gold hoarded',
      'rec.none': 'No records yet',

      'hud.floor': 'B{n}',
      'hud.lv': 'Lv',
      'hud.exp': 'EXP',
      'hud.hp': 'HP',
      'hud.mp': 'MP',
      'hud.atk': 'ATK',
      'hud.def': 'DEF',
      'hud.gold': 'Gold',
      'hud.key': 'Keys',
      'hud.turn': 'Turn',
      'hud.weapon': 'Weapon',
      'hud.armor': 'Armor',

      'btn.skill': 'Fire Bolt',
      'btn.potion': 'Potion',
      'btn.rest': 'Rest',
      'btn.pause': 'Menu',

      'help.title': 'How to Play',
      'help.h1': 'Moving',
      'help.t1': 'D-pad, arrow keys / WASD, swipe, or tap a visible tile. Unlit places stay hidden until you light them.',
      'help.h2': 'Fighting',
      'help.t2': 'Step into a monster to strike it. Fire Bolt flies at the nearest monster in sight. Resting restores MP — but something may approach.',
      'help.h3': 'Searching',
      'help.t3': 'Chests hold weapons, armor, keys and gold. Locked doors need a key. Floor traps stay invisible until triggered. Find the stairs and descend.',
      'help.h4': 'The Goal',
      'help.t4': 'Slay the Cinder Dragon on B10 and take the spire’s treasure. Death ends the run — only your record survives for the next hero.',

      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.save': 'Save now',
      'pause.titleBtn': 'Quit to title',
      'pause.settings': 'Settings',
      'pause.help': 'How to Play',

      'over.dTitle': 'The Lantern Went Out',
      'over.dBody': '{name} ended you on floor B{f}.',
      'over.dark': 'the dark itself',
      'over.retry': 'Try again',
      'over.toTitle': 'Back to title',

      'over.vTitle': 'Treasure of the Spire',
      'over.vBody': 'You broke the Cinder Dragon and claimed the treasure on floor B{f}.',
      'over.deeper': 'Descend further',
      'over.retire': 'End the run',

      'toast.saved': 'Saved',
      'toast.loaded': 'Run resumed',
      'toast.noSave': 'No save data found',
      'toast.del': 'Data deleted',
      'toast.sndOn': 'Sound ON',
      'toast.sndOff': 'Sound OFF',
      'toast.lang': 'Language changed',
      'toast.quit': 'Returned to title',

      'item.potion': 'Herb',
      'item.gold': 'gold',
      'item.key': 'Key',
      'item.chest': 'Chest',
      'item.stairs': 'Stairs',
      'item.wpn0': 'Rusty Sword',
      'item.wpn1': 'Iron Sword',
      'item.wpn2': 'Steel Sword',
      'item.wpn3': 'Runed Blade',
      'item.wpn4': 'Ember Fang',
      'item.arm0': 'Cloth Garb',
      'item.arm1': 'Leather Armor',
      'item.arm2': 'Chainmail',
      'item.arm3': 'Warded Plate',

      'mon.slime': 'Slime',
      'mon.beetle': 'Beetle',
      'mon.bat': 'Bat',
      'mon.goblin': 'Goblin',
      'mon.skeleton': 'Skeleton',
      'mon.ooze': 'Ooze',
      'mon.spider': 'Whip Spider',
      'mon.wraith': 'Wraith',
      'mon.imp': 'Imp',
      'mon.brigand': 'Brigand',
      'mon.knight': 'Iron Knight',
      'mon.mimic': 'Mimic',
      'mon.dragon': 'Cinder Dragon',
      'mon.elder': 'Elder Cinder Dragon',

      'msg.floor': 'You descend to floor B{n}.',
      'msg.floorHint': 'Find the stairs and go deeper.',
      'msg.potion': 'Picked up {n}.',
      'msg.gold': 'gold +{n}',
      'msg.key': 'Picked up a key.',
      'msg.wpn': 'You found {n}.',
      'msg.wpnBetter': 'Equipped {n} (ATK +{v}).',
      'msg.armBetter': 'Equipped {n} (DEF +{v}).',
      'msg.wpnKeep': '{n} waits for a worthier hand — {cur} serves you better.',
      'msg.chest': 'You opened the chest.',
      'msg.chestEmpty': 'The chest was empty.',
      'msg.mimicReveal': 'The chest lurches upright!',
      'msg.locked': 'Locked — a key is needed.',
      'msg.useKey': 'The key turns. The door opens.',
      'msg.trap': 'A trap bites you for {n}.',
      'msg.hit': '{name} takes {n} damage.',
      'msg.crit': 'Critical! {name} takes {n} damage.',
      'msg.miss': 'Your strike finds nothing.',
      'msg.kill': '{name} is slain.',
      'msg.hurt': '{name} carves you for {n}.',
      'msg.dodge': 'You slip aside.',
      'msg.steal': '{name} pockets {n} gold.',
      'msg.noMp': 'Not enough MP.',
      'msg.noTarget': 'No monster in sight.',
      'msg.noPotion': 'No potions left.',
      'msg.heal': 'You recover {n} HP.',
      'msg.fullHp': 'Already at full HP.',
      'msg.fullMp': 'Already at full MP.',
      'msg.rest': 'You steady your breath (MP +1).',
      'msg.ambush': 'Something stirs in the dark…!',
      'msg.levelUp': 'Level {n}! Your wounds close.',
      'msg.bossWarn': 'A scorching breath — the Cinder Dragon wakes.',
      'msg.bossDown': 'The Cinder Dragon collapses, and the spire’s treasure rolls free.',
      'msg.crowned': 'You take the treasure of the spire.',
      'msg.newRecord': '◆ New record!',
      'msg.died': 'Slain by {name}.',
      'msg.deeper': 'Deeper still. The spire begins to breathe.',
      'msg.saveFail': 'Could not save'
    },

    'zh': {
      'title.a': '灰烬之塔',
      'title.b': 'EMBER SPIRE',
      'title.tag': '塔底沉睡着熄灭的灯火。',
      'title.hint': '点击开始',
      'title.best': '最深 B{n} 层',

      'menu.new': '新的冒险',
      'menu.cont': '继续游戏',
      'menu.records': '战绩',
      'menu.help': '玩法',
      'menu.settings': '设置',

      'common.close': '关闭',
      'common.back': '返回',

      'set.sound': '音效',
      'set.lang': '语言',
      'set.data': '存档',
      'set.del': '删除存档',
      'set.delSure': '确定要删除存档和战绩吗？',
      'set.on': '开',
      'set.off': '关',
      'set.hint': '进度会自动保存在本机',

      'rec.title': '冒险战绩',
      'rec.best': '到达的最深层',
      'rec.deepest': '倒下的层',
      'rec.runs': '挑战次数',
      'rec.kills': '击败敌人',
      'rec.gold': '累计金币',
      'rec.none': '暂无战绩',

      'hud.floor': 'B{n}层',
      'hud.lv': '等级',
      'hud.exp': '经验',
      'hud.hp': '生命',
      'hud.mp': '魔力',
      'hud.atk': '攻击',
      'hud.def': '防御',
      'hud.gold': '金币',
      'hud.key': '钥匙',
      'hud.turn': '回合',
      'hud.weapon': '武器',
      'hud.armor': '护甲',

      'btn.skill': '火球术',
      'btn.potion': '药水',
      'btn.rest': '休息',
      'btn.pause': '菜单',

      'help.title': '玩法',
      'help.h1': '移动',
      'help.t1': '方向键、键盘 WASD/箭头、滑动屏幕，或点击可见的格子。未被灯火照亮的地方一片漆黑。',
      'help.h2': '战斗',
      'help.t2': '走进敌人所在的格子即可攻击。火球术会飞向视野内最近的敌人。休息可回复魔力，但敌人可能逼近。',
      'help.h3': '探索',
      'help.t3': '宝箱中有武器、护甲、钥匙和金币。上锁的门需要钥匙。脚下的陷阱在触发前隐形。找到阶梯继续向下。',
      'help.h4': '目标',
      'help.t4': '在 B10 层击败灰烬龙就能夺得塔中之宝。死亡即结束 — 只有战绩留给下一位勇者。',

      'pause.title': '暂停',
      'pause.resume': '继续',
      'pause.save': '立即保存',
      'pause.titleBtn': '返回标题',
      'pause.settings': '设置',
      'pause.help': '玩法',

      'over.dTitle': '灯火熄灭',
      'over.dBody': '你被{name}击倒在了 B{f} 层。',
      'over.dark': '黑暗本身',
      'over.retry': '再次挑战',
      'over.toTitle': '返回标题',

      'over.vTitle': '塔中之宝',
      'over.vBody': '你击败了灰烬龙，在 B{f} 层夺得了塔中之宝。',
      'over.deeper': '继续深入',
      'over.retire': '结束冒险',

      'toast.saved': '已保存',
      'toast.loaded': '已读取存档',
      'toast.noSave': '没有找到存档',
      'toast.del': '存档已删除',
      'toast.sndOn': '音效 开',
      'toast.sndOff': '音效 关',
      'toast.lang': '语言已切换',
      'toast.quit': '已返回标题',

      'item.potion': '药草',
      'item.gold': '金币',
      'item.key': '钥匙',
      'item.chest': '宝箱',
      'item.stairs': '阶梯',
      'item.wpn0': '生锈之剑',
      'item.wpn1': '铁剑',
      'item.wpn2': '钢剑',
      'item.wpn3': '符文之刃',
      'item.wpn4': '灰烬之牙',
      'item.arm0': '布衣',
      'item.arm1': '皮甲',
      'item.arm2': '锁子甲',
      'item.arm3': '守护板甲',

      'mon.slime': '史莱姆',
      'mon.beetle': '甲虫',
      'mon.bat': '蝙蝠',
      'mon.goblin': '哥布林',
      'mon.skeleton': '骷髅',
      'mon.ooze': '怪泥',
      'mon.spider': '巨蜘蛛',
      'mon.wraith': '亡魂',
      'mon.imp': '小恶魔',
      'mon.brigand': '强盗',
      'mon.knight': '铁骑士',
      'mon.mimic': '宝箱怪',
      'mon.dragon': '灰烬龙',
      'mon.elder': '古灰烬龙',

      'msg.floor': '你下到了 B{n} 层。',
      'msg.floorHint': '找到阶梯，继续深入。',
      'msg.potion': '拾取了{n}。',
      'msg.gold': '金币 +{n}',
      'msg.key': '拾取了钥匙。',
      'msg.wpn': '发现了{n}。',
      'msg.wpnBetter': '装备{n}（攻击+{v}）。',
      'msg.armBetter': '装备{n}（防御+{v}）。',
      'msg.wpnKeep': '{n}在等待更合适的主人 — 你的{cur}更好。',
      'msg.chest': '你打开了宝箱。',
      'msg.chestEmpty': '宝箱是空的。',
      'msg.mimicReveal': '宝箱猛地立了起来！',
      'msg.locked': '已上锁 — 需要钥匙。',
      'msg.useKey': '钥匙转动，门开了。',
      'msg.trap': '踩中陷阱！受到{n}点伤害。',
      'msg.hit': '对{name}造成{n}点伤害。',
      'msg.crit': '会心一击！对{name}造成{n}点伤害。',
      'msg.miss': '你的攻击落空了。',
      'msg.kill': '击败了{name}。',
      'msg.hurt': '{name}对你造成{n}点伤害。',
      'msg.dodge': '你闪开了攻击。',
      'msg.steal': '{name}夺走了{n}金币。',
      'msg.noMp': '魔力不足。',
      'msg.noTarget': '视野内没有敌人。',
      'msg.noPotion': '没有药水了。',
      'msg.heal': '回复了{n}点生命。',
      'msg.fullHp': '生命已满。',
      'msg.fullMp': '魔力已满。',
      'msg.rest': '你调匀呼吸（魔力+1）。',
      'msg.ambush': '黑暗中传来声响…！',
      'msg.levelUp': '升到 {n} 级！伤势痊愈。',
      'msg.bossWarn': '灼热的吐息 — 灰烬龙苏醒了。',
      'msg.bossDown': '灰烬龙崩塌，塔中之宝滚落而出。',
      'msg.crowned': '你夺得了塔中之宝。',
      'msg.newRecord': '◆ 新纪录！',
      'msg.died': '被{name}击败。',
      'msg.deeper': '继续深入，塔开始呼吸。',
      'msg.saveFail': '保存失败'
    }
  };

  var lang = 'en';
  var listeners = [];

  function detect() {
    var nav = global.navigator;
    var list = (nav && (nav.languages || [nav.language || nav.userLanguage])) || ['en'];
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i] || '').toLowerCase();
      if (tag.indexOf('ja') === 0) return 'ja';
      if (tag.indexOf('zh') === 0) return 'zh';
      if (tag.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }

  function pack(key) {
    var s = STR[lang];
    if (s && Object.prototype.hasOwnProperty.call(s, key)) return s[key];
    if (STR.en && Object.prototype.hasOwnProperty.call(STR.en, key)) return STR.en[key];
    return key;
  }

  function t(key, params) {
    var out = pack(key);
    if (!params) return out;
    return out.replace(/\{(\w+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : all;
    });
  }

  function setLang(next, silent) {
    if (LANGS.indexOf(next) < 0) next = 'en';
    lang = next;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = HTML_LANG[next];
      applyStatic(document);
    }
    if (!silent && listeners.length) {
      for (var i = 0; i < listeners.length; i++) listeners[i](lang);
    }
    return lang;
  }

  /* Re-translate any element carrying data-i18n / data-i18n-title / data-i18n-ph. */
  function applyStatic(root) {
    if (typeof document === 'undefined') return;
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var titled = scope.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < titled.length; j++) {
      titled[j].setAttribute('title', t(titled[j].getAttribute('data-i18n-title')));
      titled[j].setAttribute('aria-label', t(titled[j].getAttribute('data-i18n-title')));
    }
    var ph = scope.querySelectorAll('[data-i18n-ph]');
    for (var k = 0; k < ph.length; k++) {
      ph[k].setAttribute('placeholder', t(ph[k].getAttribute('data-i18n-ph')));
    }
  }

  global.I18N = {
    LANGS: LANGS,
    LANG_NAME: LANG_NAME,
    STR: STR,
    detect: detect,
    t: t,
    getLang: function () { return lang; },
    setLang: setLang,
    applyStatic: applyStatic,
    onChange: function (fn) { listeners.push(fn); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.I18N;
})(typeof globalThis !== 'undefined' ? globalThis : this);
