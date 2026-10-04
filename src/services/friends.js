/* BROADROADS - Friends, Social System & Private Messaging Engine */
import { sound } from '../audio/sound.js';
import { state } from '../game/state.js';

const DEFAULT_FRIENDS = [
  { username: 'Aegis_Vanguard', status: 'in_lobby', level: 45, classId: 'paladin', rank: 'Gold II' },
  { username: 'Kael_Starlight', status: 'in_match', level: 72, classId: 'arcanist', rank: 'Diamond IV' },
  { username: 'Nova_Striker', status: 'online', level: 31, classId: 'gunner', rank: 'Silver I' },
  { username: 'Shadow_Cleaver', status: 'offline', level: 18, classId: 'paladin', rank: 'Bronze III' }
];

class FriendsManager {
  constructor() {
    this.friends = [];
    this.chatHistory = {};
    this.activeChatFriend = null;
    this.init();
  }

  init() {
    const savedFriends = localStorage.getItem('broadroads_friends_list');
    if (savedFriends) {
      try {
        this.friends = JSON.parse(savedFriends);
      } catch (e) {
        this.friends = [...DEFAULT_FRIENDS];
      }
    } else {
      this.friends = [...DEFAULT_FRIENDS];
      this.saveFriends();
    }
    state.friends = this.friends;

    const savedChat = localStorage.getItem('broadroads_chat_history');
    if (savedChat) {
      try {
        this.chatHistory = JSON.parse(savedChat);
      } catch (e) {
        this.chatHistory = {};
      }
    }
    state.chatHistory = this.chatHistory;
  }

  saveFriends() {
    localStorage.setItem('broadroads_friends_list', JSON.stringify(this.friends));
    state.friends = this.friends;
  }

  saveChatHistory() {
    localStorage.setItem('broadroads_chat_history', JSON.stringify(this.chatHistory));
    state.chatHistory = this.chatHistory;
  }

  addFriend(username) {
    const clean = (username || '').trim();
    if (!clean || clean.length < 2) return { success: false, error: 'Enter a valid username' };
    if (clean.toLowerCase() === state.username.toLowerCase()) {
      return { success: false, error: 'Cannot add yourself as friend' };
    }
    if (this.friends.some(f => f.username.toLowerCase() === clean.toLowerCase())) {
      return { success: false, error: 'Friend already in your list' };
    }

    const newFriend = {
      username: clean,
      status: 'online',
      level: Math.floor(Math.random() * 50) + 1,
      classId: ['paladin', 'gunner', 'arcanist'][Math.floor(Math.random() * 3)],
      rank: ['Silver II', 'Gold III', 'Platinum IV', 'Bronze I'][Math.floor(Math.random() * 4)]
    };
    this.friends.push(newFriend);
    this.saveFriends();
    this.renderFriendsList();
    sound.playPickup();
    return { success: true, message: `Added ${clean} to friends list!` };
  }

  removeFriend(username) {
    this.friends = this.friends.filter(f => f.username.toLowerCase() !== username.toLowerCase());
    this.saveFriends();
    if (this.activeChatFriend && this.activeChatFriend.toLowerCase() === username.toLowerCase()) {
      this.closeChat();
    }
    this.renderFriendsList();
  }

  openChat(username) {
    this.activeChatFriend = username;
    state.activeChatFriend = username;
    const dock = document.getElementById('private-chat-dock');
    const headerTitle = document.getElementById('chat-dock-username');
    if (dock) dock.style.display = 'flex';
    if (headerTitle) headerTitle.textContent = username.toUpperCase();
    this.renderChatMessages(username);
    const input = document.getElementById('chat-dock-input');
    if (input) {
      input.focus();
    }
    sound.playPickup();
  }

  closeChat() {
    this.activeChatFriend = null;
    state.activeChatFriend = null;
    const dock = document.getElementById('private-chat-dock');
    if (dock) dock.style.display = 'none';
  }

  sendMessage(text) {
    const friend = this.activeChatFriend;
    if (!friend || !text || !text.trim()) return;
    const cleanText = text.trim();

    if (!this.chatHistory[friend]) this.chatHistory[friend] = [];
    const msgObj = {
      sender: state.username,
      text: cleanText,
      timestamp: Date.now()
    };
    this.chatHistory[friend].push(msgObj);
    this.saveChatHistory();
    this.renderChatMessages(friend);

    // Send packet over PeerJS if connected to this friend in network
    if (window.net && window.net.send) {
      window.net.send({
        type: 'PRIVATE_CHAT',
        targetUser: friend,
        sender: state.username,
        text: cleanText
      });
    }

    // If friend is a simulated friend, reply after 1.5s
    if (DEFAULT_FRIENDS.some(f => f.username.toLowerCase() === friend.toLowerCase())) {
      setTimeout(() => {
        const replies = [
          'Ready for combat whenever you are!',
          'Joining queue in a minute!',
          'Let’s take down the Crucible Anvil!',
          'Nice build! Are you playing PvP or Co-op?'
        ];
        const botReply = replies[Math.floor(Math.random() * replies.length)];
        this.receiveMessage(friend, botReply);
      }, 1500);
    }
  }

  receiveMessage(fromUser, text) {
    if (!this.chatHistory[fromUser]) this.chatHistory[fromUser] = [];
    this.chatHistory[fromUser].push({
      sender: fromUser,
      text: text,
      timestamp: Date.now()
    });
    this.saveChatHistory();

    if (this.activeChatFriend === fromUser) {
      this.renderChatMessages(fromUser);
    } else {
      this.showToast(`💬 Whisper from ${fromUser}: "${text}"`);
    }
    sound.playPickup();
  }

  renderChatMessages(username) {
    const list = document.getElementById('chat-dock-messages');
    if (!list) return;
    list.innerHTML = '';
    const msgs = this.chatHistory[username] || [];
    msgs.forEach(m => {
      const bubble = document.createElement('div');
      const isMe = m.sender === state.username;
      bubble.className = `chat-bubble ${isMe ? 'chat-me' : 'chat-friend'}`;
      const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      bubble.innerHTML = `
        <div class="chat-bubble-text">${escapeHtml(m.text)}</div>
        <div class="chat-bubble-time">${timeStr}</div>
      `;
      list.appendChild(bubble);
    });
    list.scrollTop = list.scrollHeight;
  }

  inviteFriend(friendUsername, mode = 'coop') {
    const roomCode = (window.net && window.net.roomNumber) ? window.net.roomNumber : '748201';
    this.showToast(`📩 Invitation sent to ${friendUsername}!`, 'info');
    sound.playFanfare();

    if (window.net && window.net.send) {
      window.net.send({
        type: 'GAME_INVITE',
        targetUser: friendUsername,
        sender: state.username,
        mode: mode,
        roomCode: roomCode
      });
    }

    // If simulated friend, simulate acceptance after 2 seconds
    if (DEFAULT_FRIENDS.some(f => f.username.toLowerCase() === friendUsername.toLowerCase())) {
      setTimeout(() => {
        this.showToast(`✨ ${friendUsername} accepted your match invite!`, 'success');
        sound.playFanfare();
        // Add to lobby roster
        if (mode === 'pvp' && window.pvpEngine) {
          window.pvpEngine.addPlayerToTeam(friendUsername, state.pvp.playerTeam);
        } else if (window.net) {
          window.net.simulateAddGuest(friendUsername);
        }
      }, 2000);
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('invite-toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `hextech-toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✨' : '🔔'}</span>
      <span class="toast-msg">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
    }, 4000);
  }

  showInteractiveInvite(fromUser, mode, roomCode) {
    const container = document.getElementById('invite-toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'hextech-toast toast-invite interactive';
    const modeName = mode === 'pvp' ? '5v5 PvP Arena' : 'Online Co-op Squad';
    toast.innerHTML = `
      <div style="font-weight: 900; color: #ffb703; font-size: 13px;">⚔️ MATCH INVITATION</div>
      <div style="font-size: 12px; margin: 4px 0 8px 0;"><strong>${fromUser}</strong> invited you to <strong>${modeName}</strong>!</div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-toast-accept" id="btn-accept-${roomCode}">ACCEPT</button>
        <button class="btn-toast-decline" id="btn-decline-${roomCode}">DECLINE</button>
      </div>
    `;
    container.appendChild(toast);

    toast.querySelector(`#btn-accept-${roomCode}`).addEventListener('click', () => {
      sound.playFanfare();
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      if (window.clientNav) {
        window.clientNav.acceptInviteAndJoin(mode, roomCode);
      }
    });

    toast.querySelector(`#btn-decline-${roomCode}`).addEventListener('click', () => {
      sound.playHit();
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 15000);
  }

  renderFriendsList() {
    const list = document.getElementById('friends-list-container');
    const badge = document.getElementById('friends-online-count');
    if (!list) return;

    list.innerHTML = '';
    const onlineList = this.friends.filter(f => f.status !== 'offline');
    if (badge) badge.textContent = onlineList.length;

    this.friends.forEach(f => {
      const card = document.createElement('div');
      card.className = 'friend-card';
      const statusLabels = {
        online: '🟢 Online',
        in_lobby: '🟡 In Lobby',
        in_match: '⚔️ In Match',
        offline: '⚪ Offline'
      };

      card.innerHTML = `
        <div class="friend-card-left" data-user="${f.username}">
          <div class="friend-avatar">${f.classId === 'gunner' ? '🏹' : (f.classId === 'arcanist' ? '🔮' : '🛡️')}</div>
          <div class="friend-info">
            <div class="friend-name-row">
              <span class="friend-name">${escapeHtml(f.username)}</span>
              <span class="friend-lvl">LV.${f.level || 1}</span>
            </div>
            <div class="friend-status status-${f.status}">${statusLabels[f.status] || 'Online'} • ${f.rank || 'Silver'}</div>
          </div>
        </div>
        <div class="friend-actions">
          <button class="btn-friend-action btn-friend-chat" data-user="${f.username}" title="Whisper / Chat">💬</button>
          <button class="btn-friend-action btn-friend-invite" data-user="${f.username}" title="Invite to Match">📩</button>
        </div>
      `;

      card.querySelector('.friend-card-left').addEventListener('click', () => {
        if (window.clientNav) window.clientNav.openProfileModal(f);
      });
      card.querySelector('.btn-friend-chat').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openChat(f.username);
      });
      card.querySelector('.btn-friend-invite').addEventListener('click', (e) => {
        e.stopPropagation();
        this.inviteFriend(f.username, state.gameMode);
      });

      list.appendChild(card);
    });
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

function createToastContainer() {
  let el = document.getElementById('invite-toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'invite-toast-container';
    el.className = 'invite-toast-container';
    document.body.appendChild(el);
  }
  return el;
}

const friendsManager = new FriendsManager();
export { friendsManager, FriendsManager };
window.friendsManager = friendsManager;
