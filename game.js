const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 1. 🚀 游戏无尽矩阵状态
let gameOver = false;
let isPaused = false; 
let score = 0;
let level = 1;
let exp = 0;
let expNeeded = 5;
let currentLoop = 1;        // 当前循环大波次（每60斩升级一次难度）
let lastBossKills = 0;      // 记录上一次击杀 Boss 时的击杀数
let killsSinceLastBoss = 0; // 自上一次击杀 Boss 以来新杀的怪物数
let bossCounter = 1;        // Boss 登场的代数（第1只，第2只...）
let invincibleTimer = 0;    // 暴走无敌状态倒计时（帧数）

// 2. 🚀 玩家（土豆）核心属性面板
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 15,
    speed: 3.5,
    hp: 100,
    maxHp: 100,
    color: "#f39c12", 
    shootCooldown: 30, 
    shootTimer: 0,
    damage: 1,
    gunType: "pistol",
    baseProjectiles: 1,     // 初始手枪弹道数为 1 发
    critRate: 0.10,         // 初始暴击率 10%
    leechRate: 0.00,        // 初始吸血率 0%
    lastLeechTime: 0,       // 记录上一次吸血成功的游戏时间，用于 ICD 冷却判定
    // 👑 史诗专属机制深度升级变量
    pierceChance: 0.00,     // 穿透率（选一次变35%，选三次变105%转化为必定穿透1次+下一个怪5%概率穿透）
    isNova: false,          // 是否解锁暴击全向散弹
    novaProjectiles: 2,     // 🟢 确保初始为 2，代表第 1 次选红装时触发 1 分 2 分裂
    ignoreICD: false    
};

// 3. 🚀 动态进化道具池（完全重构：普通与史诗无任何数值和属性重叠，全部可无限次重复抽取！）
const shopItems = [
    // ⚪ 普通白色词条：纯粹的基础属性增量、百分比即时气血补给
    { id: "speed", name: "👟 疾行步伐", desc: "移动速度平稳提升 10%", effect: () => { player.speed *= 1.10; } },
    { id: "damage", name: "🔥 尖刺外壳", desc: "基础攻击力稳步提升 1 点", effect: () => { player.damage += 1; } }, 
    { id: "crit", name: "🎯 鹰眼准星", desc: "暴击率稳步提升 10%", effect: () => { player.critRate = Math.min(1.0, player.critRate + 0.10); } },
	{ id: "atkSpd", name: "⚔️ 运转齿轮", desc: "基础射击速度提升 10%！(缩短 10% 射击冷却，可无限叠加)", effect: () => { player.shootCooldown = Math.max(4, player.shootCooldown * 0.90); } },
	{ 
        id: "shotgun", 
        name: "💥 散弹枪改装", 
        desc: "打破单发限制！每次选择均使全武器的攻击弹道数量永久 +1！", 
        effect: () => { 
            player.gunType = "shotgun"; 
            player.baseProjectiles += 1; 
        } 
    },

    // 👑 红色史诗词条：零数值重叠！全面转化为机制突变与无限维度叠加
    { 
        id: "epic_pierce", 
        name: "👑 [史诗] 毁灭穿透机制", 
        desc: "子弹获得穿透异能：穿透率提升 35%！(当穿透率超过 100% 时，将永久转化为【必定穿透次数 +1】并无限叠加！)", 
        effect: () => { player.pierceChance += 0.35; } 
    },
    {
        id: "epic_titan",
        name: "👑 [史诗] 泰坦巨神之血",
        desc: "生命质变：生命上限永久暴涨 +20 点，并瞬间回满全部气血！(可无限叠加)", 
        effect: () => { player.maxHp += 20; player.hp = player.maxHp; } 
    },
    {
        id: "epic_nova",
        name: "👑 [史诗] 恶魔裂变弹头", // 🚀 更名：从全向爆裂升级为裂变
        desc: "子弹触发暴击时，将以【被击中的怪】为中心向四周爆散分裂！初始 1 分 2，后续每重复选择一次，分裂子弹数永久 +1！",
        effect: () => { 
            player.isNova = true; 
            player.novaProjectiles += 1; // 🚀 机制重构：每次复选，裂变个数 +1（初始是1分2，再选变1分3，1分4...）
        } 
    },
    { 
        id: "epic_vampire", 
        name: "👑 [史诗] 鲜血始祖禁术", 
        desc: "吸血禁术觉醒：吸血概率永久大幅提升 4%！(可无限重复选择，吸血绝对上限 25%)", 
        effect: () => { 
            player.leechRate = Math.min(0.25, player.leechRate + 0.04); 
        } 
    }
];

// 4. 游戏实体容器
const enemies = [];
const bullets = [];
const gems = [];
const numbers = []; // 存放空中飘浮的伤害/治愈数字对象

// 5. 输入控制监听（电脑键盘）
const keys = {};
window.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

// 6. 输入控制监听（手机虚拟摇杆）
let joystick = { active: false, startX: 0, startY: 0, curX: 0, curY: 0, vx: 0, vy: 0 };

canvas.addEventListener("touchstart", (e) => {
    if (isPaused || gameOver) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const tx = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const ty = (touch.clientY - rect.top) * (canvas.height / rect.height);
    
    if (tx < canvas.width / 2) {
        joystick.active = true;
        joystick.startX = tx;
        joystick.startY = ty;
        joystick.curX = tx;
        joystick.curY = ty;
    }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    if (!joystick.active || isPaused || gameOver) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    joystick.curX = (touch.clientX - rect.left) * (canvas.width / rect.width);
    joystick.curY = (touch.clientY - rect.top) * (canvas.height / rect.height);

    let dx = joystick.curX - joystick.startX;
    let dy = joystick.curY - joystick.startY;
    let dist = Math.hypot(dx, dy);
    let maxDist = 40;

    if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
    }
    joystick.vx = dx / maxDist;
    joystick.vy = dy / maxDist;
}, { passive: false });

canvas.addEventListener("touchend", () => {
    joystick.active = false;
    joystick.vx = 0;
    joystick.vy = 0;
});

// 7. 🚀 玩家位移与散射矩阵弹道算法（注入了 pierceCount 穿透未初始化标记 `-1`）
function updatePlayer() {
    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
    }

    if (joystick.active) {
        dx = joystick.vx;
        dy = joystick.vy;
    }

    player.x += dx * player.speed;
    player.y += dy * player.speed;

    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    player.shootTimer++;
    if (player.shootTimer >= player.shootCooldown && enemies.length > 0) {
        let nearestEnemy = null;
        let minDist = Infinity;
        
        for (let enemy of enemies) {
            let d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            if (d < minDist) {
                minDist = d;
                nearestEnemy = enemy;
            }
        }

        if (nearestEnemy) {
            let baseAngle = Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x);
            
            if (player.gunType === "shotgun") {
                const count = player.baseProjectiles;
                const spread = 0.18; 
                const startAngle = baseAngle - ((count - 1) * spread) / 2;

                for (let i = 0; i < count; i++) {
                    let angle = startAngle + i * spread;
                    bullets.push({
                        x: player.x, y: player.y,
                        vx: Math.cos(angle) * 7, vy: Math.sin(angle) * 7,
                        size: 4, pierceCount: -1, // 🚀 标记穿透生命周期
						damage: player.damage // 🚀 新增：让刚射出来的子弹带上你当时的真实基础攻击力
                    });
                }
            } else {
                bullets.push({
                    x: player.x, y: player.y,
                    vx: Math.cos(baseAngle) * 7, vy: Math.sin(baseAngle) * 7,
                    size: 4, pierceCount: -1, // 🚀 标记穿透生命周期
					damage: player.damage // 🚀 新增：让刚射出来的子弹带上你当时的真实基础攻击力
                });
            }
            player.shootTimer = 0;
        }
    }
}
// 8. 🚀 重构商店抽取逻辑：整点升级触发三选二，击败 Boss 维持三选一
function triggerShop(isBossShop = false) {
    isPaused = true;
    const modal = document.getElementById("shopModal");
    const container = document.getElementById("itemContainer");
    container.innerHTML = "";

    // 🚀 核心修正：精准剥离判定
    // 只有当“不是 Boss 商店”且“当前等级是 5 的倍数”时，才给 2 次购买额度；Boss 商店或普通升级固定为 1 次
    let maxSelect = (!isBossShop && level % 5 === 0) ? 2 : 1;
    let selectedCount = 0; // 记录玩家在当前货架上已经点击购买了多少件

    // 动态调整弹窗顶部的标题文字，给予玩家精准的视觉反馈
    const shopTitle = modal.querySelector("h2");
    if (shopTitle) {
        if (!isBossShop && level % 5 === 0) {
            shopTitle.innerHTML = `🎉 <span style="color: #f1c40f;">【整点特惠】</span>恭喜升至 ${level} 级！请选择 <span style="color: #e74c3c; font-size: 24px;">2</span> 项强化：`;
        } else if (isBossShop) {
            shopTitle.innerHTML = `👑 <span style="color: #9b59b6;">【首领斩首狂欢】</span>请极其慎重地选择 <span style="color: #f1c40f; font-size: 24px;">1</span> 项史诗强化：`;
        } else {
            shopTitle.innerHTML = `🎉 恭喜升级！请选择 1 项强化：`;
        }
    }

    // 从总池子中精准剥离普通和史诗道具
    const epics = shopItems.filter(item => item.id.startsWith("epic_"));
    const normals = shopItems.filter(item => !item.id.startsWith("epic_"));

    let selectedItems = [];

    if (isBossShop) {
        // Boss 专属商店：固定抽取 1 个红色史诗机制 + 2 个普通词条
        const shuffledEpics = [...epics].sort(() => 0.5 - Math.random());
        const shuffledNormals = [...normals].sort(() => 0.5 - Math.random());
        selectedItems = [shuffledEpics[0], ...shuffledNormals.slice(0, 2)];
    } else {
        // 普通升级商店：只允许抽取 3 个普通词条，史诗机制绝不乱入
        const shuffledNormals = [...normals].sort(() => 0.5 - Math.random());
        selectedItems = shuffledNormals.slice(0, 3);
    }

    selectedItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-card";
        
        let displayDesc = item.desc;
        if (item.id === "shotgun" && player.gunType === "shotgun") {
            displayDesc = `使当前的散弹枪攻击弹道数进化至：${player.baseProjectiles + 1} 发！`;
        }
        if (item.id === "epic_nova" && player.isNova) {
            displayDesc = `使暴击时迸发出的全向弹道数进化至：${player.novaProjectiles + 1} 发！`;
        }

        card.innerHTML = `
            <div class="item-name">${item.name}</div>
            <div class="item-desc">${displayDesc}</div>
        `;
        
        // 核心交互改动：支持多次点击选购
        card.addEventListener("click", () => {
            // 如果这张卡片已经被点过，防止玩家无脑重复刷单张卡
            if (card.style.opacity === "0.4") return;

            item.effect(); // 执行加成效果
            selectedCount++; // 已购买额度递增
            
            // 实时刷新顶部血条和等级看板数据
            document.getElementById("hp").innerText = `生命值: ${Math.floor(player.hp)}/${player.maxHp}`;
            document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
            
            // 购买过的卡片在视觉上变淡，并剥夺其后续重复点击的资格
            card.style.opacity = "0.4";
            card.style.pointerEvents = "none";
            card.style.borderColor = "#7f8c8d";

            // 🚀 核心判定：只有当购买次数达到了设定的配额（普通1次，5整倍数/Boss店2次）后，才允许关闭商店
            if (selectedCount >= maxSelect) {
                modal.classList.add("hidden");
                isPaused = false;
                gameLoop(); // 恢复游戏物理主循环
            } else {
                // 如果是三选二且刚点了第 1 个，更新一下标题提示玩家继续点第 2 个
                if (shopTitle) {
                    shopTitle.innerHTML = `🎉 还可再选择 <span style="color: #e74c3c; font-size: 24px;">1</span> 项强化：`;
                }
            }
        });
        container.appendChild(card);
    });

    modal.classList.remove("hidden");
}

// 9. 🚀 变异刷怪与无尽波次进化核心算法
let enemyTimer = 0;
let bossActive = false; 

function spawnEnemies() {
    enemyTimer++;
    currentLoop = 1 + Math.floor(score / 60);

    // 🚀 Boss 安全冷却区判定：斩杀 50 只怪物触发下一代 Boss
    if (lastBossKills > 0) {
        killsSinceLastBoss = score - lastBossKills;
    } else {
        killsSinceLastBoss = score; 
    }

    const shouldSpawnBoss = (killsSinceLastBoss >= 50);
    if (shouldSpawnBoss && !bossActive) {
        enemies.push({
            type: "boss",
            x: canvas.width / 2,
            y: -40,
            size: 40, 
            speed: 1.0, 
            hp: 120 * bossCounter, 
            maxHp: 120 * bossCounter,
            color: "#9b59b6",
            generation: bossCounter
        });
        bossActive = true;
        
        const bossTitleElement = document.querySelector(".boss-title");
        if (bossTitleElement) {
            bossTitleElement.innerText = `⚠️ 警告：第 ${bossCounter} 轮 · 灾变恶魔宿主 ⚠️`;
        }

        const bossContainer = document.getElementById("bossHealthContainer");
        if (bossContainer) {
            bossContainer.classList.remove("hidden");
        }
        updateBossBar(100, 100);
    }

    // 🚀 普通怪与精英怪刷新
    if (enemyTimer > Math.max(12, 45 - level * 2)) {
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? -10 : canvas.width + 10;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? -10 : canvas.height + 10;
        }

        const isEliteUnlocked = (score >= 30);
        if (isEliteUnlocked && Math.random() < 0.3) {
            enemies.push({
                type: "elite", x: x, y: y, size: 20,
                speed: 1.4 + (currentLoop * 0.1), hp: 4 * currentLoop, color: "#3498db",
                state: "walk", timer: 0, dashVx: 0, dashVy: 0
            });
        } else {
            enemies.push({
                type: "normal", x: x, y: y, size: 10,
                speed: 1.2 + (currentLoop * 0.1), hp: 1 + Math.floor(currentLoop / 2), color: "#e74c3c",
                state: "walk", timer: 0, dashVx: 0, dashVy: 0
            });
        }
        enemyTimer = 0;
    }
}

// 10. 辅助更新顶部 Boss 血条 UI
function updateBossBar(current, max) {
    const bar = document.getElementById("bossHpBar");
    if (bar) {
        const percentage = Math.max(0, (current / max) * 100);
        bar.style.width = percentage + "%";
    }
}
// 11. 🚀 核心游戏主循环（前半段：物理、命中与超上限穿透判定）
function gameLoop() {
    if (gameOver || isPaused) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updatePlayer();
    spawnEnemies();

    // 【逻辑 A】经验石绘制与磁性吸附
    for (let i = gems.length - 1; i >= 0; i--) {
        let gem = gems[i];
        ctx.fillStyle = gem.color || "#2ecc71";
        ctx.beginPath();
        ctx.arc(gem.x, gem.y, gem.size, 0, Math.PI * 2);
        ctx.fill();

        let d = Math.hypot(player.x - gem.x, player.y - gem.y);
        if (d < 50) {
            gem.x += (player.x - gem.x) * 0.2;
            gem.y += (player.y - gem.y) * 0.2;
        }

        if (d < player.size + gem.size) {
            gems.splice(i, 1);
            exp += gem.value;
            
            if (exp >= expNeeded) {
                // 🚀 核心重构：升级时的动态生命体感反馈机制
                if (player.hp >= player.maxHp) {
                    // 情况 A：血条是满的 ──> 永久增加【当前等级数】的生命上限
                    // 例如：1级升2级满血，上限+1；6级升7级满血，上限直接永久+6！越到后期满血越香！
                    player.maxHp += level;
                    player.hp = player.maxHp; // 保持满血状态
                    
                    // 弹出金色飘字反馈增加上限的成就感
                    numbers.push({
                        x: player.x, y: player.y - player.size,
                        text: `🛡️ MAX HP +${level}!`,
                        isCrit: true, life: 45, vx: 0, vy: -1.5
                    });
                } else {
                    // 情况 B：血条不满 ──> 动态计算并立刻恢复失去血量的 20%
                    let lostHp = player.maxHp - player.hp;
                    let healAmount = Math.max(1, Math.floor(lostHp * 0.20)); // 保底至少回1点血
                    
                    player.hp = Math.min(player.maxHp, player.hp + healAmount);
                    
                    // 弹出绿色加血飘字反馈伤势紧急治疗
                    numbers.push({
                        x: player.x, y: player.y - player.size,
                        text: `❤️ +${healAmount}`,
                        isCrit: false, life: 35, vx: 0, vy: -1.2, isHeal: true
                    });
                }

                // 正常执行升级、扣除经验、跨越等级和推开商店逻辑（维持原样）
                level++;
                exp = 0;
                expNeeded = Math.floor(expNeeded * 1.5);
                triggerShop(false);
            } else {
                document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
            }
        }

    }

    // 【逻辑 B】子弹位移、命中判定、无限穿透矩阵、全向爆裂核心物理引擎
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        ctx.fillStyle = "#f1c40f";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();

        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
			if (Math.hypot(b.x - e.x, b.y - e.y) < b.size + e.size) {
                
                // 🚀 核心修改：如果子弹当前基础伤害已经小于 1（彻底衰减），强制剥夺穿透和暴击能力
                let canCritAndPierce = (b.damage < 1) ? false : true;

                // 🚀 1. 核心判定：计算暴击（只有未经穿透的初始子弹/未打上非暴击标记的子弹且伤害>=1，才能概率触发暴击）
                let finalDamage = b.damage;
                let isCrit = false;
                
                if (canCritAndPierce && !b.cannotCrit) {
                    isCrit = Math.random() < player.critRate;
                    if (isCrit) {
                        finalDamage *= 2; // 暴击伤害翻倍
                    }
                }
                
                // 敌人扣除当前子弹携带的最终伤害
                e.hp -= finalDamage; 

                // 🚀 2. 核心机制：恶魔裂变弹头（暴击分裂子弹攻击力平均分，且永久无法穿透和暴击）
                if (isCrit && player.isNova) {
                    const count = player.novaProjectiles; 
                    let startAngle = Math.random() * Math.PI; 
                    
                    // 💥 数学公式：分裂子弹的总伤害继承自这一发子弹暴击前的基础伤害（或最终伤害平均分）
                    // 按照“攻击力平均分”规则：
                    let splitDamage = finalDamage / count;

                    for (let k = 0; k < count; k++) {
                        let angle = startAngle + ((Math.PI * 2) / count) * k; 
                        bullets.push({ 
                            x: e.x, y: e.y, 
                            vx: Math.cos(angle) * 6, vy: Math.sin(angle) * 6, 
                            size: 3,         
                            damage: splitDamage, // 🟢 伤害平均分
                            pierceCount: 0,      // 🟢 裂变子弹穿透数直接锁死 0（无法穿透）
                            cannotCrit: true     // 🚀 裂变子弹永久打上禁止暴击标记
                        });
                    }
                }

                // 吸血与彩色飘字生成（维持原样，由于 finalDamage 动态衰减，飘字也会同步变小）
                let currentFrame = score * 10 + invincibleTimer;
                if (Math.random() < player.leechRate && (currentFrame - player.lastLeechTime > 30)) {
                    player.hp = Math.min(player.maxHp, player.hp + 1); 
                    player.lastLeechTime = currentFrame;
                    document.getElementById("hp").innerText = `生命值: ${Math.floor(player.hp)}/${player.maxHp}`;
                    numbers.push({ x: player.x, y: player.y - player.size, text: "❤️ +1", isCrit: false, life: 30, vx: 0, vy: -1, isHeal: true });
                }

                numbers.push({
                    x: e.x, y: e.y - e.size,
                    text: isCrit ? `💥 ${Math.floor(finalDamage)}!` : Math.floor(finalDamage),
                    isCrit: isCrit, life: 40, vx: (Math.random() * 2 - 1) * 0.5, vy: -1.2
                });

                if (e.type === "boss") {
                    updateBossBar(e.hp, e.maxHp);
                }

                // 怪物死亡判定链（维持原样）
                if (e.hp <= 0) {
                    if (e.type === "boss") {
                        bossActive = false; lastBossKills = score; bossCounter++;         
                        const bossContainer = document.getElementById("bossHealthContainer");
                        if (bossContainer) bossContainer.classList.add("hidden");
                        for (let k = 0; k < 20; k++) {
                            gems.push({ x: e.x + (Math.random() * 60 - 30), y: e.y + (Math.random() * 60 - 30), size: 6, value: 3, color: "#f1c40f" });
                        }
                        invincibleTimer = 180; player.color = "#f1c40f"; 
                        setTimeout(() => { triggerShop(true); }, 20); 
                    } else if (e.type === "elite") {
                        gems.push({ x: e.x, y: e.y, size: 6, value: 3, color: "#f1c40f" }); 
                        for (let k = 0; k < 2; k++) {
                            enemies.push({ type: "spider", x: e.x + (k === 0 ? -10 : 10), y: e.y, size: 6, speed: 2.8, hp: 1, color: "#e67e22" });
                        }
                    } else {
                        gems.push({ x: e.x, y: e.y, size: 4, value: 1, color: "#2ecc71" });
                    }
                    enemies.splice(j, 1); score++;
                    document.getElementById("score").innerText = "击杀数: " + score;
                }

                // 🚀 3. 核心机制：硬核穿透矩阵判定（穿透与暴击互斥，且穿透后只能有概率穿透，伤害每穿一次衰减一半）
                if (isCrit) {
                    // 🟢 规则一：穿透和暴击不能同时触发。如果子弹这一发出了暴击，强制剥夺后续穿透权，直接销毁！
                    bullets.splice(i, 1);
                } else if (canCritAndPierce) {
                    // 如果没出暴击，判定子弹穿透生命周期
                    if (b.pierceCount === -1) {
                        // 首次撞击：动态解算一生的穿透次数
                        let totalChance = player.pierceChance;
                        let basePierce = Math.floor(totalChance); 
                        let remChance = totalChance - basePierce; 
                        b.pierceCount = basePierce + (Math.random() < remChance ? 1 : 0);
                    }

                    if (b.pierceCount > 0) {
                        b.pierceCount--;      // 消耗一次穿透机会
                        b.damage *= 0.5;      // 🟢 规则二：穿透子弹伤害每穿透一次，攻击力衰减一半！
                        b.cannotCrit = true;  // 🟢 规则三：穿透后的子弹只能继续有概率穿透，永久无法触发暴击
                    } else {
                        bullets.splice(i, 1); // 穿透数用尽，销毁
                    }
                } else {
                    // 伤害已经小于1，无法穿透，直接销毁
                    bullets.splice(i, 1);
                }
                break;
            }
        }
    }
    // 【逻辑 C】敌人追踪、蓄力状态机与伤害判定
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        
        if (e.type === "boss" || e.type === "spider") {
            let angle = Math.atan2(player.y - e.y, player.x - e.x);
            e.x += Math.cos(angle) * e.speed;
            e.y += Math.sin(angle) * e.speed;
        } else {
            e.timer++;
            if (e.state === "walk") {
                let angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
                if (e.timer > 180 && Math.random() < 0.02) {
                    e.state = "charge";
                    e.timer = 0;
                }
            } else if (e.state === "charge") {
                let angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.dashVx = Math.cos(angle) * (e.speed * 3.5); 
                e.dashVy = Math.sin(angle) * (e.speed * 3.5);
                if (e.timer > 35) { 
                    e.state = "dash";
                    e.timer = 0;
                }
            } else if (e.state === "dash") {
                e.x += e.dashVx;
                e.y += e.dashVy;
                if (e.timer > 20) { 
                    e.state = "walk";
                    e.timer = 0;
                }
            }
        }

        // 核心渲染绘制
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        
        if (e.state === "charge") {
            ctx.fillStyle = "#ffffff"; 
            ctx.strokeStyle = "#ff0000";
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            ctx.fillStyle = e.color;
        }
        ctx.fill();

		// 玩家触敌扣血与 🚀 黄金金身反伤/秒杀拦截判定
        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            
            if (invincibleTimer > 0) {
                // 🚀 核心修改：无敌金身期间，碰到的任何怪血量直接强制归 0（瞬间秒杀！）
                e.hp = 0; 
                
                // 同时，为了让秒杀更有打击反馈，我们顺手在被你撞死的怪头顶爆出一个金色的“CRUSH!”数字字样
                numbers.push({
                    x: e.x,
                    y: e.y - e.size,
                    text: "💥 CRUSH!",
                    isCrit: true, // 借用暴击的金色描边红字特效，视觉拉满
                    life: 25,     // 飘字存活稍微短一点，显得更迅猛
                    vx: (Math.random() * 4 - 2), // 被撞飞的随机左右横移
                    vy: -2        // 快速向上飘升
                });
                
                continue; // 拦截退出，不扣玩家血量，并且逻辑向后走会触发怪物的死亡判定和掉落
            }

            // 正常状态下的扣血逻辑维持原样（无需变动）：
            let damageFactor = (e.state === "dash") ? 1.0 : 0.5;
            player.hp -= damageFactor;
            
            document.getElementById("hp").innerText = `生命值: ${Math.max(0, Math.floor(player.hp))}/${player.maxHp}`;
            if (player.hp <= 0) {
                gameOver = true;
                alert(`不幸阵亡！你英勇地突围到了第 ${currentLoop} 轮无尽维度，最终拿下了 ${score} 个击杀斩首！`);
                window.location.reload();
            }
        }
    }
	
    // 【逻辑 D】更新并绘制伤害数字飘字
    for (let i = numbers.length - 1; i >= 0; i--) {
        let n = numbers[i];
        n.x += n.vx;
        n.y += n.vy;
        n.life--;

        let alpha = n.life / 40;
        ctx.save();
        
        if (n.isCrit) {
            ctx.font = `bold 18px sans-serif`;
            ctx.fillStyle = `rgba(231, 76, 60, ${alpha})`; 
            ctx.strokeStyle = `rgba(241, 196, 15, ${alpha})`; 
            ctx.lineWidth = 2;
            ctx.textAlign = "center";
            ctx.strokeText(n.text, n.x, n.y);
            ctx.fillText(n.text, n.x, n.y);
        } else {
            ctx.font = "13px sans-serif";
            ctx.fillStyle = n.isHeal ? `rgba(46, 204, 113, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
            ctx.textAlign = "center";
            ctx.fillText(n.text, n.x, n.y);
        }
        ctx.restore();

        if (n.life <= 0) {
            numbers.splice(i, 1);
        }
    }

    // 处理玩家击杀 Boss 后的 3 秒暴走状态时间线
    if (invincibleTimer > 0) {
        invincibleTimer--;
        player.color = "#f1c40f"; 
        if (player.gunType === "pistol") {
            player.shootTimer += 2; 
        }
        if (invincibleTimer <= 0) {
            player.color = "#f39c12"; 
        }
    }

    // 🚀 绘制土豆主角与增强无敌暴走特效
    if (invincibleTimer > 0) {
        let waveProgress = (invincibleTimer % 30) / 30; 
        let auraRadius = player.size + (30 * (1 - waveProgress)); 
        let auraAlpha = waveProgress * 0.5; 
        
        ctx.save();
        ctx.strokeStyle = `rgba(241, 196, 15, ${auraAlpha})`; 
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, auraRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        ctx.shadowColor = "#f1c40f";
        ctx.shadowBlur = 15;
        ctx.fillStyle = "#f1c40f"; 
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else {
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // 【逻辑 E】绘制手机端摇杆 UI
    if (joystick.active) {
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(joystick.startX, joystick.startY, 40, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.arc(joystick.curX, joystick.curY, 15, 0, Math.PI * 2);
        ctx.fill();
    }

    requestAnimationFrame(gameLoop);
}

// 12. 最终启动进化状态机
gameLoop();
