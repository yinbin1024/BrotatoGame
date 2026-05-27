const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 1. 游戏全局状态初始化
let gameOver = false;
let isPaused = false; 
let score = 0;
let level = 1;
let exp = 0;
let expNeeded = 5;

// 2. 玩家（土豆）属性（🚀 新增 gunType 属性，默认为单发 'pistol'）
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
    damage: 1, // 初始攻击力
	gunType: "pistol" // 初始武器：手枪。后续可升级为 'shotgun'（散弹枪）
};

// 3. 道具池配置（🚀 新增：散弹枪改装卷轴，几率出现在三选一中）
const shopItems = [
    { id: "speed", name: "👟 疾行土豆", desc: "移动速度提升 15%", effect: () => { player.speed *= 1.15; } },
    { id: "atkSpd", name: "⚔️ 疯狂加特林", desc: "射击速度提升 20%", effect: () => { player.shootCooldown = Math.max(6, player.shootCooldown * 0.8); } },
    { id: "maxHp", name: "🛡️ 防护壳", desc: "生命上限 +25 并补满血", effect: () => { player.maxHp += 25; player.hp = player.maxHp; } },
    { id: "damage", name: "🔥 尖刺外壳", desc: "子弹伤害提升 1 点", effect: () => { player.damage += 1; } },
    { 
        id: "shotgun", 
        name: "💥 散弹枪改装", 
        desc: "每次攻击喷射 3 发散射子弹", 
        effect: () => { 
            player.gunType = "shotgun"; 
            // 🚀 新增：选完之后，顺手把自己从商店道具池(shopItems)中彻底剔除
            const index = shopItems.findIndex(item => item.id === "shotgun");
            if (index !== -1) shopItems.splice(index, 1);
        } 
    }
];

// 4. 实体存储数组
const enemies = [];
const bullets = [];
const gems = [];

// 5. 输入控制监听（电脑端键盘）
const keys = {};
window.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

// 6. 输入控制监听（手机端虚拟摇杆）
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

// 7. 🚀 玩家位移与散射矩阵弹道算法
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
            // 计算锁定敌人的基础角度
            let baseAngle = Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x);
            
            if (player.gunType === "shotgun") {
                // 🚀 散弹枪模式：同时发射 3 发子弹（中间一发，左右各偏转 0.2 弧度）
                const angles = [baseAngle - 0.2, baseAngle, baseAngle + 0.2];
                angles.forEach(angle => {
                    bullets.push({
                        x: player.x,
                        y: player.y,
                        vx: Math.cos(angle) * 7,
                        vy: Math.sin(angle) * 7,
                        size: 4
                    });
                });
            } else {
                // 普通手枪模式：单发子弹
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

// 8. 触发三选一商店函数
function triggerShop() {
    isPaused = true; // 暂停游戏逻辑
    
    const modal = document.getElementById("shopModal");
    const container = document.getElementById("itemContainer");
    container.innerHTML = ""; // 清空上一次的道具

    // 随机打乱道具池并挑选前 3 个
    const shuffled = [...shopItems].sort(() => 0.5 - Math.random());
    const selectedItems = shuffled.slice(0, 3);

    // 动态创建 3 张道具卡片 UI
    selectedItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-card";
        card.innerHTML = `
            <div class="item-name">${item.name}</div>
            <div class="item-desc">${item.desc}</div>
        `;
        
        // 点击卡片后的核心交互逻辑
        card.addEventListener("click", () => {
            item.effect(); // 执行道具对应的增强加成
            
            // 更新看板数据
            document.getElementById("hp").innerText = `生命值: ${Math.floor(player.hp)}/${player.maxHp}`;
            document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
            
            modal.classList.add("hidden"); // 隐藏商店弹窗
            isPaused = false; // 恢复游戏运行
            gameLoop(); // 重新唤醒游戏主循环
        });
        
        container.appendChild(card);
    });

    modal.classList.remove("hidden"); // 显示商店弹窗
}

// 9. 敌人生成逻辑
let enemyTimer = 0;
function spawnEnemies() {
    enemyTimer++;
    if (enemyTimer > Math.max(15, 45 - level * 3)) {
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? -10 : canvas.width + 10;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? -10 : canvas.height + 10;
        }
        enemies.push({ 
            x: x, 
            y: y, 
            size: 10, 
            speed: 1.2 + (level * 0.1), 
            hp: 1 + Math.floor(level / 2) 
        });
        enemyTimer = 0;
    }
}

// 10. 游戏主循环（核心物理与渲染）
function gameLoop() {
     if (gameOver || isPaused) return; // 如果游戏结束或处于暂停（打开商店）状态，直接拦截退出

    // 清空画面
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 运行更新
    updatePlayer();
    spawnEnemies();

    // 【逻辑A】绘制并拾取经验石
    for (let i = gems.length - 1; i >= 0; i--) {
        let gem = gems[i];
        ctx.fillStyle = "#2ecc71";
        ctx.beginPath();
        ctx.arc(gem.x, gem.y, gem.size, 0, Math.PI * 2);
        ctx.fill();

        // 磁性吸附
        let d = Math.hypot(player.x - gem.x, player.y - gem.y);
        if (d < 50) {
            gem.x += (player.x - gem.x) * 0.2;
            gem.y += (player.y - gem.y) * 0.2;
        }

        // 升级判定
        if (d < player.size + gem.size) {
            gems.splice(i, 1);
            exp++;
            if (exp >= expNeeded) {
                level++;
                exp = 0;
                expNeeded = Math.floor(expNeeded * 1.5);
				
                // 触发三选一商店
                triggerShop();
           } else {
                // 如果没有升级，只更新经验文本看板
                document.getElementById("level").innerText = `等级: ${level} (EXP: ${exp}/${expNeeded})`;
           }
        }
    }

    // 【逻辑B】子弹位移与命中判定
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        ctx.fillStyle = "#f1c40f";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();

        // 出界删除
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
        }

        // 命中敌人
        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (Math.hypot(b.x - e.x, b.y - e.y) < b.size + e.size) {
                bullets.splice(i, 1);
				
               // 敌人受到的伤害
                e.hp -= player.damage; 
				
                if (e.hp <= 0) {
                    gems.push({ x: e.x, y: e.y, size: 4 }); // 爆出经验石
                    enemies.splice(j, 1);
                    score++;
                    document.getElementById("score").innerText = "击杀数: " + score;
                }
                break;
            }
        }
    }

    // 【逻辑C】敌人追踪与伤害判定
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        let angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        ctx.fillStyle = "#e74c3c";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();

        // 持续接触扣血
        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            player.hp -= 0.5;
            document.getElementById("hp").innerText = `生命值: ${Math.max(0, Math.floor(player.hp))}/${player.maxHp}`;
            if (player.hp <= 0) {
                gameOver = true;
                alert(`战死沙场！你坚持到了第 ${level} 级，一共消灭了 ${score} 个敌人！`);
                window.location.reload();
            }
        }
    }

    // 【逻辑D】绘制主角
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
    ctx.fill();

    // 【逻辑E】绘制手机端虚拟摇杆UI
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

    // 持续循环
    requestAnimationFrame(gameLoop);
}

// 11. 启动游戏
gameLoop();
