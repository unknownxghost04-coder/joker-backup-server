require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKUP_KEY = process.env.BACKUP_KEY || 'bigboss_secret_key_2026';
const ACCESS_PIN = process.env.WEB_ACCESS_PIN || '426580@Sunzy';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}
app.use('/backups', express.static(backupsDir));

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// Helper function to load metadata safely
function getMetadata(filePath) {
    let metadata = {
        dateTime: 'N/A',
        botNumber: 'Unknown Bot',
        senderName: 'N/A',
        senderNumber: 'N/A',
        replierName: 'N/A',
        replierNumber: 'N/A',
        chatType: 'N/A',
        groupName: 'N/A',
        caption: 'N/A',
        userReply: 'N/A'
    };

    if (fs.existsSync(filePath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            metadata = { ...metadata, ...parsed };
        } catch(e) {}
    }
    return metadata;
}

// 🔒 Main Dashboard Route
app.get('/', (req, res) => {
    const userPin = req.query.pin;
    const selectedBot = req.query.bot; // Filter by selected bot number

    if (userPin !== ACCESS_PIN) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>🤡 Joker Vault - Access Locked</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { background: #0f172a; color: #f8fafc; font-family: sans-serif; text-align: center; padding-top: 100px; margin: 0; }
                    .login-box { background: #1e293b; border: 2px solid #ef4444; border-radius: 12px; padding: 30px; display: inline-block; max-width: 320px; width: 90%; }
                    input { width: 100%; padding: 12px; margin: 15px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; text-align: center; font-size: 16px; box-sizing: border-box; }
                    button { width: 100%; padding: 12px; background: #ef4444; border: none; color: white; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; }
                </style>
            </head>
            <body>
                <div class="login-box">
                    <h2>🔒 VAULT ACCESS</h2>
                    <form method="GET" action="/">
                        <input type="password" name="pin" placeholder="Enter Access Code" required autofocus />
                        <button type="submit">Unlock</button>
                    </form>
                    ${userPin ? '<p style="color: #ef4444; margin-top: 10px;">Incorrect Access Code!</p>' : ''}
                </div>
            </body>
            </html>
        `);
    }

    let bodyContentHtml = '';
    let botTabsHtml = '';

    try {
        const allFiles = fs.readdirSync(backupsDir);
        // Exclude JSON metadata files
        const rawMediaFiles = allFiles.filter(f => !f.endsWith('.json'));

        // Attach stat (mtime) and metadata to sort accurately from newest to oldest
        let mediaItems = rawMediaFiles.map(file => {
            const filePath = path.join(backupsDir, file);
            const metaPath = filePath + '.json';
            const stats = fs.statSync(filePath);
            const metadata = getMetadata(metaPath);

            return {
                fileName: file,
                filePath: filePath,
                mtime: stats.mtimeMs,
                metadata: metadata
            };
        });

        // Sort: Newest to Oldest
        mediaItems.sort((a, b) => b.mtime - a.mtime);

        // Group media items by Bot Number
        const botGroups = {};
        mediaItems.forEach(item => {
            const bNum = item.metadata.botNumber || 'Unknown Bot';
            if (!botGroups[bNum]) botGroups[bNum] = [];
            botGroups[bNum].push(item);
        });

        const botNumbers = Object.keys(botGroups);

        // Build navigation tabs for bots
        botTabsHtml = `
            <a href="/?pin=${encodeURIComponent(userPin)}" class="nav-tab ${!selectedBot ? 'active' : ''}">🤖 All Bots (${botNumbers.length})</a>
            ${botNumbers.map(bot => `
                <a href="/?pin=${encodeURIComponent(userPin)}&bot=${encodeURIComponent(bot)}" class="nav-tab ${selectedBot === bot ? 'active' : ''}">
                    📱 ${bot} (${botGroups[bot].length})
                </a>
            `).join('')}
        `;

        // Case 1: Overview mode (No specific bot selected) -> Display Bot Folders
        if (!selectedBot) {
            if (botNumbers.length === 0) {
                bodyContentHtml = '<p style="color: #94a3b8; text-align: center; grid-column: 1/-1;">No bot uploads found.</p>';
            } else {
                bodyContentHtml = '<div class="folder-grid">' + botNumbers.map(bot => {
                    const count = botGroups[bot].length;
                    const latestItem = botGroups[bot][0];
                    const isVid = latestItem.fileName.endsWith('.mp4');
                    const previewUrl = '/backups/' + latestItem.fileName;

                    return `
                        <a href="/?pin=${encodeURIComponent(userPin)}&bot=${encodeURIComponent(bot)}" class="folder-card">
                            <div class="folder-preview">
                                ${isVid 
                                    ? `<video src="${previewUrl}#t=0.5" preload="metadata"></video>` 
                                    : `<img src="${previewUrl}" loading="lazy" />`}
                            </div>
                            <div class="folder-details">
                                <div class="folder-title">🤖 Bot: ${bot}</div>
                                <div class="folder-count">📁 ${count} Media ${count === 1 ? 'file' : 'files'}</div>
                            </div>
                        </a>
                    `;
                }).join('') + '</div>';
            }
        } 
        // Case 2: Specific Bot selected -> Display Media Grid for this Bot
        else {
            const filteredItems = botGroups[selectedBot] || [];

            if (filteredItems.length === 0) {
                bodyContentHtml = `<p style="color: #94a3b8; text-align: center; grid-column: 1/-1;">No media uploaded for bot: <b>${selectedBot}</b></p>`;
            } else {
                const mediaCardsHtml = filteredItems.map(item => {
                    const file = item.fileName;
                    const isVideo = file.endsWith('.mp4');
                    const fileUrl = '/backups/' + file;
                    const safeMeta = JSON.stringify(item.metadata).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                    const mediaTag = isVideo 
                        ? '<video src="' + fileUrl + '" controls preload="metadata"></video>'
                        : '<img src="' + fileUrl + '" loading="lazy" />';

                    return `
                        <div class="media-card" id="card-${file}">
                            <div class="card-checkbox-wrapper">
                                <input type="checkbox" name="selectedFiles" value="${file}" class="file-checkbox" onchange="toggleCardStyle(this, '${file}')" />
                            </div>
                            ${mediaTag}
                            <div class="card-info">
                                <button class="btn-info" data-meta='${safeMeta}' onclick="showInfo(this)">ℹ️ Info</button>
                                <form method="POST" action="/delete" style="margin: 0;">
                                    <input type="hidden" name="pin" value="${userPin}" />
                                    <input type="hidden" name="fileNames" value="${file}" />
                                    <button type="submit" class="btn-delete" onclick="return confirm('Delete this file permanently?')">🗑️ Delete</button>
                                </form>
                            </div>
                        </div>
                    `;
                }).join('');

                bodyContentHtml = `<div class="grid">${mediaCardsHtml}</div>`;
            }
        }

    } catch (e) {
        console.error(e);
        bodyContentHtml = '<p style="color: #ef4444; text-align: center;">Error reading storage directory.</p>';
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🤡 Joker Vault - Gallery</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background: #0f172a; color: #f8fafc; font-family: sans-serif; margin: 0; padding: 20px; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #22c55e; padding-bottom: 15px; }
                h1 { color: #22c55e; margin: 0 0 5px 0; }
                
                .bot-nav { max-width: 1200px; margin: 0 auto 15px auto; display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; }
                .nav-tab { background: #1e293b; color: #94a3b8; text-decoration: none; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: bold; border: 1px solid #334155; whitespace-nowrap: nowrap; }
                .nav-tab.active, .nav-tab:hover { background: #22c55e; color: #0f172a; border-color: #22c55e; }

                .toolbar { max-width: 1200px; margin: 0 auto 20px auto; display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; background: #1e293b; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155; align-items: center; }
                .toolbar-group { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
                .btn-tool { background: #334155; border: none; color: white; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
                .btn-tool:hover { background: #475569; }
                .btn-mark-all { background: #2563eb; }
                .btn-mark-all:hover { background: #1d4ed8; }
                .btn-delete-selected { background: #dc2626; }
                .btn-delete-selected:hover { background: #b91c1c; }

                /* Folder Grid View */
                .folder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; max-width: 1200px; margin: 0 auto; }
                .folder-card { background: #1e293b; border: 2px solid #334155; border-radius: 10px; overflow: hidden; text-decoration: none; color: white; transition: transform 0.2s, border-color 0.2s; display: flex; flex-direction: column; }
                .folder-card:hover { transform: translateY(-3px); border-color: #22c55e; }
                .folder-preview { height: 160px; background: #000; overflow: hidden; }
                .folder-preview img, .folder-preview video { width: 100%; height: 100%; object-fit: cover; opacity: 0.8; }
                .folder-details { padding: 15px; background: #1e293b; }
                .folder-title { font-weight: bold; font-size: 16px; color: #22c55e; margin-bottom: 5px; }
                .folder-count { font-size: 13px; color: #94a3b8; }

                /* Media Grid View */
                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; max-width: 1200px; margin: 0 auto; }
                .media-card { background: #1e293b; border: 2px solid #334155; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; position: relative; transition: border-color 0.2s; }
                .media-card.marked { border-color: #22c55e; box-shadow: 0 0 10px rgba(34, 197, 94, 0.3); }
                .card-checkbox-wrapper { position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(15, 23, 42, 0.7); padding: 5px; border-radius: 6px; backdrop-filter: blur(4px); }
                .file-checkbox { width: 18px; height: 18px; cursor: pointer; accent-color: #22c55e; }

                .media-card img, .media-card video { width: 100%; height: 220px; object-fit: cover; background: #000; }
                .card-info { padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; background: #1e293b; }
                .btn-info { background: #3b82f6; border: none; color: white; padding: 6px 12px; border-radius: 5px; font-size: 12px; font-weight: bold; cursor: pointer; }
                .btn-delete { background: #dc2626; border: none; color: white; padding: 6px 12px; border-radius: 5px; font-size: 12px; font-weight: bold; cursor: pointer; }
                
                .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; justify-content: center; align-items: center; }
                .modal-box { background: #1e293b; border: 1px solid #3b82f6; border-radius: 10px; padding: 20px; max-width: 420px; width: 90%; color: #f8fafc; font-family: sans-serif; max-height: 85vh; overflow-y: auto; }
                .modal-box h2 { color: #3b82f6; margin-top: 0; font-size: 18px; border-bottom: 1px solid #334155; padding-bottom: 10px; }
                .info-item { margin: 10px 0; font-size: 14px; word-break: break-word; }
                .info-item b { color: #94a3b8; display: block; font-size: 12px; margin-bottom: 2px; }
                .btn-close { margin-top: 15px; width: 100%; padding: 10px; background: #475569; border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤡 JOKER MEDIA VAULT</h1>
                <span style="color: #22c55e; font-size: 14px;">● ONLINE & SECURED</span>
            </div>

            <div class="bot-nav">
                ${botTabsHtml}
            </div>

            ${selectedBot ? `
                <div class="toolbar">
                    <div class="toolbar-group">
                        <button class="btn-tool btn-mark-all" onclick="markAll(true)">✅ Mark All</button>
                        <button class="btn-tool" onclick="markAll(false)">❌ Unmark All</button>
                    </div>
                    <div class="toolbar-group">
                        <form id="batchDeleteForm" method="POST" action="/delete" onsubmit="return confirm('Delete selected files permanently?')">
                            <input type="hidden" name="pin" value="${userPin}" />
                            <input type="hidden" name="bot" value="${selectedBot || ''}" />
                            <input type="hidden" name="fileNames" id="batchFileNames" value="" />
                            <button type="submit" class="btn-tool btn-delete-selected">🗑️ Delete Selected</button>
                        </form>
                    </div>
                </div>
            ` : ''}

            ${bodyContentHtml}

            <div id="infoModal" class="modal-overlay">
                <div class="modal-box">
                    <h2>📋 ViewOnce Details</h2>
                    <div class="info-item"><b>📅 Saved Date & Time:</b> <span id="mDateTime"></span></div>
                    <div class="info-item"><b>🤖 Bot Number:</b> <span id="mBot"></span></div>
                    <div class="info-item"><b>👤 ViewOnce Sender:</b> <span id="mSender"></span></div>
                    <div class="info-item"><b>💬 Replier Name:</b> <span id="mReplier"></span></div>
                    <div class="info-item"><b>📍 Chat Location:</b> <span id="mChatSource"></span></div>
                    <div class="info-item"><b>💬 Trigger Reply Text:</b> <span id="mReply"></span></div>
                    <div class="info-item"><b>📝 Original Caption:</b> <span id="mCaption"></span></div>
                    <button class="btn-close" onclick="closeInfo()">Close</button>
                </div>
            </div>

            <script>
                function toggleCardStyle(checkbox, fileName) {
                    const card = document.getElementById('card-' + fileName);
                    if (card) {
                        if (checkbox.checked) {
                            card.classList.add('marked');
                        } else {
                            card.classList.remove('marked');
                        }
                    }
                    updateBatchInput();
                }

                function markAll(select) {
                    const checkboxes = document.querySelectorAll('.file-checkbox');
                    checkboxes.forEach(cb => {
                        cb.checked = select;
                        const card = cb.closest('.media-card');
                        if (card) {
                            if (select) card.classList.add('marked');
                            else card.classList.remove('marked');
                        }
                    });
                    updateBatchInput();
                }

                function updateBatchInput() {
                    const checked = document.querySelectorAll('.file-checkbox:checked');
                    const filenames = Array.from(checked).map(cb => cb.value);
                    const batchInput = document.getElementById('batchFileNames');
                    if (batchInput) batchInput.value = filenames.join(',');
                }

                const batchForm = document.getElementById('batchDeleteForm');
                if (batchForm) {
                    batchForm.addEventListener('submit', function(e) {
                        const batchVal = document.getElementById('batchFileNames').value;
                        if (!batchVal) {
                            e.preventDefault();
                            alert('Please select at least one media item to delete.');
                        }
                    });
                }

                function showInfo(btn) {
                    const data = JSON.parse(btn.getAttribute('data-meta'));
                    
                    document.getElementById('mDateTime').innerText = data.dateTime || 'N/A';
                    document.getElementById('mBot').innerText = data.botNumber || 'N/A';
                    
                    // Sender Info
                    const sNum = data.senderNumber || 'N/A';
                    const sName = data.senderName || 'ViewOnce Sender';
                    document.getElementById('mSender').innerText = sName + ' (' + sNum + ')';

                    // Replier Info
                    const rNum = data.replierNumber || data.senderNumber || 'N/A';
                    const rName = data.replierName || 'Unknown User';
                    document.getElementById('mReplier').innerText = rName + ' (' + rNum + ')';

                    // Chat Location
                    if (data.chatType && (data.chatType.includes('Group') || (data.groupName && data.groupName !== 'N/A'))) {
                        const gName = (data.groupName && data.groupName !== 'N/A') ? data.groupName : 'Unknown Group';
                        document.getElementById('mChatSource').innerText = gName + ' (Group)';
                    } else {
                        document.getElementById('mChatSource').innerText = 'Private';
                    }

                    // Trigger Reply & Caption
                    document.getElementById('mReply').innerText = data.userReply || 'N/A';
                    document.getElementById('mCaption').innerText = data.caption || 'N/A';
                    
                    document.getElementById('infoModal').style.display = 'flex';
                }
                
                function closeInfo() {
                    document.getElementById('infoModal').style.display = 'none';
                }
            </script>
        </body>
        </html>
    `);
});

// 🗑️ Delete Route
app.post('/delete', (req, res) => {
    const { pin, fileNames, fileName, bot } = req.body;
    if (pin !== ACCESS_PIN) {
        return res.status(403).send('Unauthorized');
    }

    let filesToDelete = [];
    if (fileNames) {
        filesToDelete = fileNames.split(',').map(f => f.trim()).filter(Boolean);
    } else if (fileName) {
        filesToDelete = [fileName];
    }

    for (const file of filesToDelete) {
        const filePath = path.join(backupsDir, path.basename(file));
        const metaPath = path.join(backupsDir, path.basename(file) + '.json');
        
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    }

    let redirectUrl = '/?pin=' + encodeURIComponent(pin);
    if (bot) {
        redirectUrl += '&bot=' + encodeURIComponent(bot);
    }
    res.redirect(redirectUrl);
});

// 📤 API Upload Route
app.post('/api/backup', upload.any(), async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || authHeader !== 'Bearer ' + BACKUP_KEY) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const mediaFile = req.files ? req.files.find(f => f.fieldname === 'media') : null;
        if (!mediaFile) {
            return res.status(400).json({ success: false, message: 'No media file received' });
        }

        const fileName = mediaFile.originalname || ('media_' + Date.now());
        const localPath = path.join(backupsDir, fileName);

        await fs.promises.writeFile(localPath, mediaFile.buffer);

        if (req.body.metadata) {
            const metaPath = path.join(backupsDir, fileName + '.json');
            await fs.promises.writeFile(metaPath, req.body.metadata);
        }

        const fileUrl = req.protocol + '://' + req.get('host') + '/backups/' + fileName;
        console.log('\n✅ [VAULT BACKUP SUCCESS] Saved: ' + fileName + '\n');
        return res.json({ success: true, fileName, url: fileUrl });

    } catch (error) {
        console.error('\n❌ [VAULT BACKUP ERROR]:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => console.log('Server listening on port ' + PORT));
