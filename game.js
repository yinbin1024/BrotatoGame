const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 1. 🚀 游戏无尽矩阵状态
let gameOver = false;
let isPaused = false; 
let score = 0;
let level = 1;
let exp = 0;
let expNeeded = 5;
let currentLoop = 1; // 当前循环大波次
let lastBossKills = 0;      // 记录上一次击杀 Boss 时的击杀数
let killsSinceLastBoss = 0; // 自上一次击杀 Boss 以来新杀的怪物数
let bossCounter = 1;        // Boss 登场的代数（第1只，第2只...）
let invincibleTimer = 0;    // 🚀 新增：暴走无敌状态倒计时（帧数）

// 2. 玩家（土豆）属性（🚀 新增 critRate 暴击与 leechRate 吸血属性）
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
    baseProjectiles: 3,
    critRate: 0.10, // 🚀 初始暴击率 10%
    leechRate: 0.00,  // 🚀 初始吸血率 0%
	lastLeechTime: 0 // 🚀 记录上一次吸血成功的游戏帧数，用于限制回血频率
};

// 3. 动态进化道具池（🚀 扩充：加入暴击针与吸血牙齿）
const shopItems = [
    { id: "speed", name: "👟 疾行土豆", desc: "移动速度提升 15%", effect: () => { player.speed *= 1.15; } },
    { id: "atkSpd", name: "⚔️ 疯狂加特林", desc: "射击速度提升 20%", effect: () => { player.shootCooldown = Math.max(6, player.shootCooldown * 0.8); } },
    { id: "maxHp", name: "🛡️ 防护壳", desc: "生命上限 +25 并补满血", effect: () => { player.maxHp += 25; player.hp = player.maxHp; } },
    { id: "damage", name: "🔥 尖刺外壳", desc: "子弹伤害提升 1 点", effect: () => { player.damage += 1; } },
    { 
        id: "shotgun", 
        name: "💥 散弹枪改装", 
        desc: "未解锁时激活散弹；已解锁则使散弹枪弹道数永久 +1！", 
        effect: () => { 
            if (player.gunType !== "shotgun") {
                player.gunType = "shotgun";
            } else {
                player.baseProjectiles += 1;
            }
        } 
    },
    // 🚀 新增暴击和吸血购买选项：
    { id: "crit", name: "🎯 鹰眼准星", desc: "暴击率永久提升 15%", effect: () => { player.critRate = Math.min(1.0, player.critRate + 0.15); } },
	{ 
        id: "epic_pierce", 
        name: "👑 [史诗] 穿透弹头", 
        desc: "子弹体积变大，且伤害永久提升 3 点！(可无限叠加)", 
        effect: () => { player.damage += 3; } 
    },
    { 
        id: "epic_vampire", 
        name: "👑 [史诗] 恶魔狂热", 
        desc: "吸血概率提升 1%，且生命上限 +20！(吸血绝对上限 25%)", 
        effect: () => { player.leechRate = Math.min(0.25, player.leechRate + 0.01); player.maxHp += 20; player.hp = Math.min(player.maxHp, player.hp + 20); } 
    }
];
// 在原本追加史诗道具的地方，为史诗吸血设置绝对上限保护：
const epicVampireItem = shopItems.find(item => item.id === "epic_vampire");
if (epicVampireItem) {
    epicVampireItem.desc = "吸血概率提升 1%，且生命上限 +20！(吸血上限 25%)";
    epicVampireItem.effect = () => { 
        player.leechRate = Math.min(0.25, player.leechRate + 0.08); // 🚀 锁死吸血率最高只能堆到 25%
        player.maxHp += 20; 
        player.hp = Math.min(player.maxHp, player.hp + 20); 
    };
}

// 4. 游戏实体容器
const enemies = [];
const bullets = [];
const gems = [];
const numbers = []; // 存放所有正在空中漂浮的伤害数字对象

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
// 7. 🚀 玩家位移与无限叠加散射矩阵弹道算法
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
                // 🚀 散弹枪无限叠加算法：根据弹道总数计算扇形夹角间隔
                const count = player.baseProjectiles;
                const spread = 0.18; // 每发子弹之间的弧度间隔
                const startAngle = baseAngle - ((count - 1) * spread) / 2;

                for (let i = 0; i < count; i++) {
                    let angle = startAngle + i * spread;
                    bullets.push({
                        x: player.x,
                        y: player.y,
                        vx: Math.cos(angle) * 7,
                        vy: Math.sin(angle) * 7,
                        size: 4
                    });
                }
            } else {
                // 普通手枪模式
                bullets.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(baseAngle) * 7,
                    vy: Math.sin(baseAngle) * 7,
                    size: 4
                });
            }
            player.shootTimer = 0;
        }
    }
}

// 8. 重构商店抽取逻辑：彻底隔离普通道具与史诗道具
function triggerShop(isBossShop = false) {
    isPaused = true;
    const modal = document.getElementById("shopModal");
    const container = document.getElementById("itemContainer");
    container.innerHTML = "";

    // 🚀 核心修复：从总池子中，用代码把史诗和普通道具强行剥离成两个独立的干粮袋
    const epics = shopItems.filter(item => item.id.startsWith("epic_"));
    const normals = shopItems.filter(item => !item.id.startsWith("epic_"));

    let selectedItems = [];

    if (isBossShop) {
        // 👑 Boss 专属商店：打乱后，强行精准抽取 1 个史诗 + 2 个普通
        const shuffledEpics = [...epics].sort(() => 0.5 - Math.random());
        const shuffledNormals = [...normals].sort(() => 0.5 - Math.random());
        selectedItems = [shuffledEpics[0], ...shuffledNormals.slice(0, 2)];
    } else {
        // 🎯 普通升级商店：打乱后，只允许在普通池子里切 3 个，史诗装备绝不准乱入
        const shuffledNormals = [...normals].sort(() => 0.5 - Math.random());
        selectedItems = shuffledNormals.slice(0, 3);
    }

    selectedItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-card";
        
        // 🚀 动态显示当前的弹道加成情况
        let displayDesc = item.desc;
        if (item.id === "shotgun" && player.gunType === "shotgun") {
            displayDesc = `使当前的散弹枪攻击弹道数进化至：${player.baseProjectiles + 1} 发！`;
        }

        card.innerHTML = `
            <div class="item-name">${item.name}</div>
            <div class="item-desc">${displayDesc}</div>
        `;
        
        card.addEventListener("click", () => {
            item.effect();
            document.getElementById("hp").innerText = `生命值: ${Math.floor(player.hp)}/${player.maxHp}`;
            document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
            
            modal.classList.add("hidden");
            isPaused = false;
            gameLoop();
        });
        container.appendChild(card);
    });

    modal.classList.remove("hidden");
}

// 9. 🚀 变异刷怪与无尽波次进化核心算法
let enemyTimer = 0;
let bossActive = false; // 全局追踪场上是否有 Boss

function spawnEnemies() {
    enemyTimer++;
    
    // 根据总击杀数计算当前应该处于第几轮大循环（每 60 斩为一个 Loop）
    currentLoop = 1 + Math.floor(score / 60);

    // 🚀 【阶段 A：Boss 降临判定】
    // 🚀 重构：安全冷却区判定。每当击杀完上一个 Boss 后，再次亲手斩杀 50 只怪物，才会激活下一个 Boss
    // 这样彻底避免了线性倍数导致的上一个还没打完，下一个就重叠刷新的 BUG
    if (lastBossKills > 0) {
        killsSinceLastBoss = score - lastBossKills;
    } else {
        killsSinceLastBoss = score; // 第一只 Boss 依然按初始累计计算
    }

    const shouldSpawnBoss = (killsSinceLastBoss >= 50);
    if (shouldSpawnBoss && !bossActive) {
        enemies.push({
            type: "boss",
            x: canvas.width / 2,
            y: -40,
            size: 40, 
            speed: 1.0, 
            hp: 120 * bossCounter, // 随着代数增加，Boss 血量阶梯式成长
            maxHp: 120 * bossCounter,
            color: "#9b59b6",
            generation: bossCounter // 记录是第几代 Boss
        });
        bossActive = true;
        
        // 🚀 重构：获取顶部血条 UI 并改名为动态的阶梯式冠名
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

    // 🚀 【阶段 B：普通怪与精英怪的高频刷新控制】
    // 刷怪频率会随着等级增加而稍微变快
    if (enemyTimer > Math.max(12, 45 - level * 2)) {
        let x, y;
        // 四周边缘随机点出场
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? -10 : canvas.width + 10;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? -10 : canvas.height + 10;
        }

        // 判定当前击杀数是否解锁了精英怪（30斩以上，且30%几率随出）
        const isEliteUnlocked = (score >= 30);
        if (isEliteUnlocked && Math.random() < 0.3) {
            // 🚀 亮蓝色精英怪属性定义
            enemies.push({
                type: "elite",
                x: x,
                y: y,
                size: 20, // 2倍体积
                speed: 1.4 + (currentLoop * 0.1),
                hp: 4 * currentLoop, // 血量随循环递增
                color: "#3498db", // 亮蓝色
                // 💡 新增变异：蓄力冲刺状态机变量
                state: "walk", // walk=寻路移动, charge=红光蓄力, dash=暴走冲刺
                timer: 0,
                dashVx: 0,
                dashVy: 0
            });
        } else {
            // 🚀 普通小怪属性定义
            enemies.push({
                type: "normal",
                x: x,
                y: y,
                size: 10,
                speed: 1.2 + (currentLoop * 0.1),
                hp: 1 + Math.floor(currentLoop / 2),
                color: "#e74c3c", // 鲜红色
                // 💡 新增变异：普通怪到达 Loop 2 后也拥有概率蓄力冲刺能力
                state: "walk",
                timer: 0,
                dashVx: 0,
                dashVy: 0
            });
        }
        enemyTimer = 0;
    }
}

// 10. 🚀 新增：辅助更新顶部 Boss 血条的纯前端 UI 函数
function updateBossBar(current, max) {
    const bar = document.getElementById("bossHpBar");
    if (bar) {
        const percentage = Math.max(0, (current / max) * 100);
        bar.style.width = percentage + "%";
    }
}
// 11. 🚀 核心物理碰撞、蓄力红绿灯AI与分裂算法主循环
function gameLoop() {
    if (gameOver || isPaused) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updatePlayer();
    spawnEnemies();

    // 【逻辑 A】绘制并拾取经验石（普通=1点，精英爆金/大绿=3点）
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
            exp += gem.value; // 根据宝石权值加经验
            
            if (exp >= expNeeded) {
                level++;
                exp = 0;
                expNeeded = Math.floor(expNeeded * 1.5);
                triggerShop();
            } else {
                document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
            }
        }
    }

    // 【逻辑 B】子弹位移与命中、Boss 血条、强行升空商店判定
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

             // 命中敌人
        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (Math.hypot(b.x - e.x, b.y - e.y) < b.size + e.size) {
                bullets.splice(i, 1);
				
                // 🚀 1. 核心暴击算法判定
                let finalDamage = player.damage;
                let isCrit = Math.random() < player.critRate;
                if (isCrit) {
                    finalDamage *= 2; // 暴击伤害翻倍
                }
                
                // 敌人扣除最终计算后的伤害
                e.hp -= finalDamage; 

				// 🚀 2. 核心吸血算法判定（引入内置冷却时间防站撸）
                // 只有当概率通过，且距离上一次吸血已经过去了至少 30 帧（大约 0.5 秒）时，才允许回血
                let currentFrame = score * 10 + invincibleTimer; // 利用现有变量组合一个递增的伪时间戳
                
                if (Math.random() < player.leechRate && (currentFrame - player.lastLeechTime > 30)) {
                    player.hp = Math.min(player.maxHp, player.hp + 1); 
                    player.lastLeechTime = currentFrame; // 🚀 更新上一次成功吸血的时间，进入 0.5 秒冷却期
                    document.getElementById("hp").innerText = `生命值: ${Math.floor(player.hp)}/${player.maxHp}`;
                    
                    // 额外小细节：可以在数字池里飘一个绿色的 "+1" 增加回血视觉反馈
                    numbers.push({
                        x: player.x,
                        y: player.y - player.size,
                        text: "❤️ +1",
                        isCrit: false,
                        life: 30,
                        vx: 0,
                        vy: -1,
                        isHeal: true // 标记为回血文字
                    });
                }

                // 🚀 3. 动态向数字池压入飘字对象
                numbers.push({
                    x: e.x,
                    y: e.y - e.size, // 在怪物的正头顶生成
                    text: isCrit ? `💥 ${finalDamage}!` : finalDamage, // 暴击文字带爆炸符号
                    isCrit: isCrit,
                    life: 40, // 文字在空中存活的帧数
                    vx: (Math.random() * 2 - 1) * 0.5, // 随机轻微左右横移
                    vy: -1.2 // 缓缓向上飘升
                });

                // 如果击中 Boss，实时更新顶部大血条
                if (e.type === "boss") {
                    updateBossBar(e.hp, e.maxHp);
                }

                // 怪物死亡判定
                if (e.hp <= 0) {
					if (e.type === "boss") {
                        // 🟢 [🚀 重构后的 Boss 斩首狂欢处理]
                        bossActive = false;
                        lastBossKills = score; // 关键：记录当前击杀数，为下一只 Boss 开启 50 斩安全冷却区
                        bossCounter++;         // 关键：Boss 代数递增
                        
                        const bossContainer = document.getElementById("bossHealthContainer");
                        if (bossContainer) {
                            bossContainer.classList.add("hidden");
                        }
                        
                        // 🚀 奖励1：原地爆散出 20 颗高额金色大宝石
                        for (let k = 0; k < 20; k++) {
                            gems.push({ 
                                x: e.x + (Math.random() * 60 - 30), 
                                y: e.y + (Math.random() * 60 - 30), 
                                size: 6, 
                                value: 3, 
                                color: "#f1c40f" 
                            });
                        }

                        // 🚀 奖励2：赋予土豆主角 3 秒钟的“黄金无敌暴走状态”（3秒 = 180帧）
                        invincibleTimer = 180;
                        player.color = "#f1c40f"; // 全身变成纯金色

                        // 🚀 奖励3：强制拉入商店，并在第四部分中锁定稀有道具权重
                        setTimeout(() => { triggerShop(true); }, 20); // 传入 true 代表这是 Boss 专属特殊商店
                        
                    } else if (e.type === "elite") {
                        // 🟢 [精英怪死亡处理] 爆金宝石 + 🚀 触发分裂出 2 只高移速小蜘蛛
                        gems.push({ x: e.x, y: e.y, size: 6, value: 3, color: "#f1c40f" }); 
                        
                        for (let k = 0; k < 2; k++) {
                            enemies.push({
                                type: "spider",
                                x: e.x + (k === 0 ? -10 : 10),
                                y: e.y,
                                size: 6, // 极小体积
                                speed: 2.8, // 速度极快
                                hp: 1, // 1血脆皮，但速度具威胁
                                color: "#e67e22" // 橘色蜘蛛
                            });
                        }
                    } else {
                        // 普通怪和小蜘蛛死亡，正常掉落普通绿宝石
                        gems.push({ x: e.x, y: e.y, size: 4, value: 1, color: "#2ecc71" });
                    }

                    enemies.splice(j, 1);
                    score++;
                    document.getElementById("score").innerText = "击杀数: " + score;
                }
                break;
            }
        }
    }

    // 【逻辑 C】怪物 AI 状态机更新（蓄力红绿灯控制）与伤害判定
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        
        if (e.type === "boss" || e.type === "spider") {
            // Boss和蜘蛛不参与冲刺状态机，保持基础追踪
            let angle = Math.atan2(player.y - e.y, player.x - e.x);
            e.x += Math.cos(angle) * e.speed;
            e.y += Math.sin(angle) * e.speed;
        } else {
            // 🚀 普通怪与精英怪的“冲刺蓄力状态机”
            e.timer++;
            
            if (e.state === "walk") {
                // 1. 寻路跟踪状态
                let angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
                
                // 每走大约 3~4 秒，有概率触发原地蓄力
                if (e.timer > 180 && Math.random() < 0.02) {
                    e.state = "charge";
                    e.timer = 0;
                }
            } else if (e.state === "charge") {
                // 2. 原地蓄力状态（此时怪完全锁死不能动，外观渲染红光警示）
                e.timer++;
                // 锁定冲刺发射的方向向量
                let angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.dashVx = Math.cos(angle) * (e.speed * 3.5); // 冲刺速度提高数倍
                e.dashVy = Math.sin(angle) * (e.speed * 3.5);

                if (e.timer > 35) { // 蓄力持续约 0.5 秒
                    e.state = "dash";
                    e.timer = 0;
                }
            } else if (e.state === "dash") {
                // 3. 极速冲刺状态（顺着向量向前滑行，不修正方向）
                e.x += e.dashVx;
                e.y += e.dashVy;
                
                if (e.timer > 20) { // 冲刺滑行约 0.3 秒后力竭
                    e.state = "walk";
                    e.timer = 0;
                }
            }
        }

        // 核心渲染绘制
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        
        if (e.state === "charge") {
            ctx.fillStyle = "#ffffff"; // 蓄力时发出危险白/红闪烁（Canvas用亮白色突出）
            ctx.strokeStyle = "#ff0000";
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            ctx.fillStyle = e.color;
        }
        ctx.fill();

        // 玩家触敌扣血判定
        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            // 冲刺状态下的怪对玩家造成双倍撞击伤害
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
	
	// 🚀 4. 新增增量逻辑：更新并绘制伤害数字飘字池
    for (let i = numbers.length - 1; i >= 0; i--) {
        let n = numbers[i];
        
        // 物理位移与生命递减
        n.x += n.vx;
        n.y += n.vy;
        n.life--;

        // 计算文字半透明淡出效果
        let alpha = n.life / 40;
        ctx.save();
        
        if (n.isCrit) {
            // 🎯 暴击大数字：带有红色高亮、金色加粗描边和震撼感
            ctx.font = `bold 18px sans-serif`;
            ctx.fillStyle = `rgba(231, 76, 60, ${alpha})`; // 鲜红色
            ctx.strokeStyle = `rgba(241, 196, 15, ${alpha})`; // 金色边缘
            ctx.lineWidth = 2;
            ctx.textAlign = "center";
            ctx.strokeText(n.text, n.x, n.y);
            ctx.fillText(n.text, n.x, n.y);
        } else {
			// 🏳️ 普通小数字：基础白色、精简小巧
            ctx.font = "13px sans-serif";
            
            // 🚀 核心修复：如果是加血文字，颜色变为醒目的翠绿色，否则保持纯白
            ctx.fillStyle = n.isHeal ? `rgba(46, 204, 113, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
            
            ctx.textAlign = "center";
            ctx.fillText(n.text, n.x, n.y);
        }
        
        ctx.restore();

        // 当文字生命值归零（飞到足够高且完全透明时），从内存中彻底释放
        if (n.life <= 0) {
            numbers.splice(i, 1);
        }
    }

    // 🚀 处理玩家击杀 Boss 后的 3 秒暴走状态时间线
    if (invincibleTimer > 0) {
        invincibleTimer--;
        player.color = "#f1c40f"; // 强制黄金色闪烁
        // 在无敌期间，由于你处于“黄金超载”，如果还是手枪，射速强行提升到极致加速割草
        if (player.gunType === "pistol") {
            player.shootTimer += 2; // 变相加快手枪开火频率
        }
        if (invincibleTimer <= 0) {
            player.color = "#f39c12"; // 状态结束，变回土豆黄
        }
    }

	// 【逻辑 D】绘制土豆主角与 🚀 增强无敌暴走特效
    if (invincibleTimer > 0) {
        // 1. 动态计算扩散光环的半径（利用 invincibleTimer 制造循环向外扩散的波纹效果）
        // 每过 30 帧波纹扩散一次，半径从玩家自身大小（15）扩散到最大（45）
        let waveProgress = (invincibleTimer % 30) / 30; // 0 到 1 的进度
        let auraRadius = player.size + (30 * (1 - waveProgress)); 
        let auraAlpha = waveProgress * 0.5; // 越往外越淡
        
        ctx.save();
        ctx.strokeStyle = `rgba(241, 196, 15, ${auraAlpha})`; // 金色光环
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, auraRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        
        // 2. 为主角本体增加一层闪烁的金色护盾边缘
        ctx.save();
        ctx.shadowColor = "#f1c40f";
        ctx.shadowBlur = 15;
        ctx.fillStyle = "#f1c40f"; // 强制纯金实体
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else {
        // 3. 正常状态下的普通土豆黄
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
