/* Theme Engine, Class Cards & Nameplates */
    function applyTheme(monthIndex) {
      if (monthIndex < 0 || monthIndex >= MONTHLY_THEMES.length) monthIndex = 0;
      state.currentMonth = monthIndex;
      const theme = MONTHLY_THEMES[monthIndex];

      // 1. Update CSS Variables for Entire Web Application
      const root = document.documentElement;
      root.style.setProperty('--theme-primary', theme.primary);
      root.style.setProperty('--theme-secondary', theme.secondary);
      root.style.setProperty('--theme-accent', theme.accent);
      root.style.setProperty('--neon-cyan', theme.primary);
      root.style.setProperty('--neon-blue', theme.secondary);
      root.style.setProperty('--neon-gold', theme.accent);
      root.style.setProperty('--bg-dark', theme.bgDark);
      root.style.setProperty('--bg-card', theme.bgCard);
      root.style.setProperty('--border-cyan', theme.borderColor);

      // 2. Update Three.js 3D Environment
      if (typeof scene !== 'undefined' && scene) {
        scene.background.setHex(theme.fogColor);
        scene.fog.color.setHex(theme.fogColor);
      }
      if (typeof ambientLight !== 'undefined' && ambientLight) ambientLight.color.setHex(theme.ambientColor);
      if (typeof sunLight !== 'undefined' && sunLight) sunLight.color.setHex(theme.sunColor);
      if (typeof forgePointLight !== 'undefined' && forgePointLight) forgePointLight.color.setHex(theme.primaryHex);
      if (typeof arenaMat !== 'undefined' && arenaMat) arenaMat.color.setHex(theme.arenaColor);
      if (typeof runeRingMat !== 'undefined' && runeRingMat) runeRingMat.color.setHex(theme.primaryHex);
      if (typeof outerRingMat !== 'undefined' && outerRingMat) outerRingMat.color.setHex(theme.accentHex);
      if (typeof pylonCrystalMat !== 'undefined' && pylonCrystalMat) {
        pylonCrystalMat.color.setHex(theme.secondaryHex);
        pylonCrystalMat.emissive.setHex(theme.secondaryHex);
      }
      if (typeof dustParticles !== 'undefined' && dustParticles) dustParticles.material.color.setHex(theme.dustHex);

      // 3. Update Subtitle & Seasonal Month Badge
      const sub = document.getElementById('theme-season-subtitle');
      if (sub) sub.textContent = `SEASON ${theme.month + 1}: ${theme.name.toUpperCase()} (${theme.monthName.toUpperCase()})`;

      const iconEl = document.getElementById('theme-season-icon');
      if (iconEl) iconEl.textContent = theme.icon;
      const nameEl = document.getElementById('theme-season-name');
      if (nameEl) nameEl.textContent = `${theme.name.toUpperCase()} (${theme.monthName.toUpperCase()})`;

      // 4. Re-render Class Cards
      renderClassSelectionCards(monthIndex);

      // 5. Update local hero visual if already initialized
      if (hero) {
        hero.setClass(state.heroClass, theme.classes[state.selectedClassIndex]);
        if (hero.nameplate) hero.nameplate.update(state.username, 1.0, false, !!(net && net.isHost));
      }
    }

    function updateLobbyFeaturedChampion(cls) {
      if (!cls) return;
      const avatarEl = document.getElementById('showcase-champ-avatar');
      const nameEl = document.getElementById('showcase-champ-name');
      const roleEl = document.getElementById('showcase-champ-role');
      const descEl = document.getElementById('showcase-champ-desc');
      const specialEl = document.getElementById('showcase-champ-special');
      const clientAvatar = document.getElementById('client-avatar-badge');

      if (avatarEl) avatarEl.textContent = cls.icon || '🛡️';
      if (clientAvatar) clientAvatar.textContent = cls.icon || '🛡️';
      if (nameEl) nameEl.textContent = (cls.name || 'CHAMPION').toUpperCase();
      if (roleEl) {
        let role = '🛡️ MELEE VANGUARD / BRUISER';
        if (cls.type === 'ranged') role = '🏹 RANGED MARKSMAN';
        else if (cls.type === 'magic') role = '🔮 ARCANE MAGE';
        roleEl.textContent = role;
      }
      if (descEl) descEl.textContent = cls.desc || '';
      if (specialEl) specialEl.textContent = `${cls.special} • ${cls.specialDesc || 'Channels ultimate runic force.'}`;
    }

    function renderClassSelectionCards(monthIndex) {
      const theme = MONTHLY_THEMES[monthIndex] || MONTHLY_THEMES[0];
      const grid = document.getElementById('class-selection-grid');
      const title = document.getElementById('class-selection-title');
      if (title) title.textContent = `${theme.name.toUpperCase()} • HERO CLASSES`;
      if (!grid) return;

      grid.innerHTML = '';
      theme.classes.forEach((cls, idx) => {
        const card = document.createElement('div');
        const isSelected = (idx === state.selectedClassIndex);
        card.className = `class-card ${isSelected ? 'selected' : ''}`;
        card.dataset.classIndex = idx;
        card.dataset.classType = cls.type;
        card.dataset.classId = cls.id;

        card.innerHTML = `
          <div class="class-card-icon">${cls.icon}</div>
          <div class="class-card-name">${cls.name}</div>
          <div class="class-card-desc">${cls.desc}</div>
          <div class="class-card-special">Special: ${cls.special}</div>
        `;

        card.addEventListener('click', () => {
          sound.playPickup();
          document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          state.selectedClassIndex = idx;
          state.heroClass = cls.id;
          state.activeClassData = cls;
          updateLobbyFeaturedChampion(cls);
          if (typeof hero !== 'undefined' && hero) {
            hero.setClass(cls.id, cls);
          }
        });

        grid.appendChild(card);
      });

      // Default active class data
      state.activeClassData = theme.classes[state.selectedClassIndex] || theme.classes[0];
      state.heroClass = state.activeClassData.id;
      updateLobbyFeaturedChampion(state.activeClassData);
    }

    function createNameplateSprite(username = 'Commander', isHost = false, colorHex = '#00f5d4') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');

      function draw(name, hpPct = 1.0, isDowned = false, isHostFlag = isHost) {
        ctx.clearRect(0, 0, 256, 70);

        // Background pill
        ctx.fillStyle = isDowned ? 'rgba(255, 0, 84, 0.75)' : 'rgba(8, 14, 28, 0.75)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(12, 6, 232, 58, 12);
        else ctx.rect(12, 6, 232, 58);
        ctx.fill();

        ctx.strokeStyle = isDowned ? '#ff0054' : colorHex;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Text
        ctx.font = 'bold 18px "Chakra Petch", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        const label = (isHostFlag ? '👑 ' : '') + name + (isDowned ? ' [DOWN]' : '');
        ctx.fillText(label, 128, 30);

        // HP Bar
        const barW = 190;
        const barH = 7;
        const barX = (256 - barW) / 2;
        const barY = 42;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(barX, barY, barW, barH);

        const clampedPct = Math.max(0, Math.min(1, hpPct));
        ctx.fillStyle = isDowned ? '#ff0054' : (clampedPct > 0.45 ? '#00f5d4' : (clampedPct > 0.2 ? '#ffb703' : '#ff0054'));
        ctx.fillRect(barX, barY, barW * clampedPct, barH);
      }

      draw(username, 1.0, false, isHost);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(3.4, 0.9, 1);
      sprite.position.set(0, 3.2, 0);

      return {
        sprite,
        update: (name, hpPct, isDowned, isHostFlag) => {
          draw(name, hpPct, isDowned, isHostFlag);
          texture.needsUpdate = true;
        }
      };
    }

export { applyTheme, updateLobbyFeaturedChampion, renderClassSelectionCards, createNameplateSprite };
window.applyTheme = applyTheme;
window.updateLobbyFeaturedChampion = updateLobbyFeaturedChampion;
window.renderClassSelectionCards = renderClassSelectionCards;
window.createNameplateSprite = createNameplateSprite;

