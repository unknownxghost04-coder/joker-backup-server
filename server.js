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

// Helper for formatting phone number groups
function formatNumberGroup(numStr) {
    if (!numStr || numStr === 'N/A') return 'N/A';
    return numStr.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 🔒 Main Dashboard
app.get('/', (req, res) => {
    const userPin = req.query.pin;

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

    let groupedHtml = '';
    try {
        const allFiles = fs.readdirSync(backupsDir);
        const mediaFiles = allFiles.filter(f => !f.endsWith('.json')).reverse();

        if (mediaFiles.length === 0) {
            groupedHtml = '<p style="color: #94a3b8; text-align: center; grid-column: 1/-1;">No stored media found.</p>';
        } else {
            // Group files by botNumber
            const groups = {};
            mediaFiles.forEach(file => {
                const metaFilePath = path.join(backupsDir, file + '.json');
                let botNumber = 'Unknown Bot';
                if (fs.existsSync(metaFilePath)) {
                    try {
                        const meta = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
                        if (meta.botNumber && meta.botNumber !== 'N/A') {
                            botNumber = meta.botNumber;
                        }
                    } catch (e) {}
                }
                if (!groups[botNumber]) groups[botNumber] = [];
                groups[botNumber].push(file);
            });

            // Build HTML grouped by bot number
            for (const [botNum, files] of Object.entries(groups)) {
                const formattedBotNum = formatNumberGroup(botNum);
                const cardsHtml = files.map(file => {
                    const isVideo = file.endsWith('.mp4');
                    const fileUrl = '/backups/' + file;
                    const metaFilePath = path.join(backupsDir, file + '.json');
                    
                    let metadata = {
                        dateTime: 'N/A',
                        botNumber: botNum,
                        senderName: 'N/A',
                        senderNumber: 'N/A',
                        replierName: 'N/A',
                        replierNumber: 'N/A',
                        chatType: 'N/A',
                        groupName: 'N/A',
                        caption: 'N/A',
                        userReply: 'N/A'
                    };

                    if (fs.existsSync(metaFilePath)) {
                        try {
                            metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
                        } catch(e) {}
                    }

                    const safeMeta = JSON.stringify(metadata).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                    // Video thumbnail preview + click play overlay
                    const mediaTag = isVideo 
                        ? '<div class="video-thumbnail-container" onclick="openVideoModal(\'' + fileUrl + '\')">' +
                            '<video src="' + fileUrl + '#t=0.5" preload="metadata"></video>' +
                            '<div class="play-overlay"><div class="play-icon">▶</div></div>' +
                          '</div>'
                        : '<img src="' + fileUrl + '" loading="lazy" />';

                    return '<div class="media-card" id="card-' + file + '">' +
                                '<div class="card-checkbox-wrapper">' +
                                    '<input type="checkbox" name="selectedFiles" value="' + file + '" class="file-checkbox" onchange="toggleCardStyle(this, \'' + file + '\')" />' +
                                '</div>' +
                                mediaTag +
                                '<div class="card-info">' +
                                    '<button class="btn-info" data-meta=\'' + safeMeta + '\' onclick="showInfo(this)">ℹ️ Info</button>' +
                                    '<form method="POST" action="/delete" style="margin: 0;">' +
                                        '<input type="hidden" name="pin" value="' + userPin + '" />' +
                                        '<input type="hidden" name="fileNames" value="' + file + '" />' +
                                        '<button type="submit" class="btn-delete" onclick="return confirm(\'Delete this file permanently?\')">🗑️ Delete</button>' +
                                    '</form>' +
                                '</div>' +
                            '</div>';
                }).join('');

                groupedHtml += `
                    <div class="bot-group-section">
                        <div class="bot-group-header">
                            🤖 Bot Number: <span>${formattedBotNum}</span> (${files.length} items)
                        </div>
                        <div class="grid">
                            ${cardsHtml}
                        </div>
                    </div>
                `;
            }
        }
    } catch (e) {
        groupedHtml = '<p style="color: #ef4444; text-align: center;">Error reading storage directory.</p>';
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
                
                .toolbar { max-width: 1200px; margin: 0 auto 20px auto; display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; background: #1e293b; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155; align-items: center; }
                .toolbar-group { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
                .btn-tool { background: #334155; border: none; color: white; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
                .btn-tool:hover { background: #475569; }
                .btn-mark-all { background: #2563eb; }
                .btn-mark-all:hover { background: #1d4ed8; }
                .btn-delete-selected { background: #dc2626; }
                .btn-delete-selected:hover { background: #b91c1c; }

                .bot-group-section { max-width: 1200px; margin: 0 auto 30px auto; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
                .bot-group-header { font-size: 18px; font-weight: bold; color: #38bdf8; margin-bottom: 15px; border-bottom: 1px solid #334155; padding-bottom: 10px; }
                .bot-group-header span { color: #22c55e; }

                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
                .media-card { background: #0f172a; border: 2px solid #334155; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; position: relative; transition: border-color 0.2s; }
                .media-card.marked { border-color: #22c55e; box-shadow: 0 0 10px rgba(34, 197, 94, 0.3); }
                .card-checkbox-wrapper { position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(15, 23, 42, 0.7); padding: 5px; border-radius: 6px; backdrop-filter: blur(4px); }
                .file-checkbox { width: 18px; height: 18px; cursor: pointer; accent-color: #22c55e; }

                .media-card img, .video-thumbnail-container video { width: 100%; height: 220px; object-fit: cover; background: #000; pointer-events: none; }
                
                /* Video Thumbnail & Play Button Overlay */
                .video-thumbnail-container { position: relative; width: 100%; height: 220px; cursor: pointer; background: #000; overflow: hidden; }
                .play-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background: rgba(0, 0, 0, 0.35); transition: background 0.2s; }
                .video-thumbnail-container:hover .play-overlay { background: rgba(0, 0, 0, 0.1); }
                .play-icon { width: 50px; height: 50px; background: rgba(34, 197, 94, 0.9); color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 20px; padding-left: 3px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }

                .card-info { padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; background: #1e293b; }
                .btn-info { background: #3b82f6; border: none; color: white; padding: 6px 12px; border-radius: 5px; font-size: 12px; font-weight: bold; cursor: pointer; }
                .btn-delete { background: #dc2626; border: none; color: white; padding: 6px 12px; border-radius: 5px; font-size: 12px; font-weight: bold; cursor: pointer; }
                
                /* Modals */
                .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 100; justify-content: center; align-items: center; backdrop-filter: blur(4px); }
                .modal-box { background: #1e293b; border: 1px solid #3b82f6; border-radius: 10px; padding: 20px; max-width: 420px; width: 90%; color: #f8fafc; font-family: sans-serif; max-height: 85vh; overflow-y: auto; }
                .modal-box h2 { color: #3b82f6; margin-top: 0; font-size: 18px; border-bottom: 1px solid #334155; padding-bottom: 10px; }
                .info-item { margin: 10px 0; font-size: 14px; word-break: break-word; }
                .info-item b { color: #94a3b8; display: block; font-size: 12px; margin-bottom: 2px; }
                .btn-close { margin-top: 15px; width: 100%; padding: 10px; background: #475569; border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; }
                
                .video-modal-box { background: #000; border: 1px solid #22c55e; border-radius: 10px; padding: 10px; max-width: 720px; width: 95%; display: flex; flex-direction: column; align-items: center; }
                .video-modal-box video { width: 100%; max-height: 75vh; border-radius: 6px; outline: none; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤡 JOKER MEDIA VAULT</h1>
                <span style="color: #22c55e; font-size: 14px;">● ONLINE & SECURED</span>
            </div>

            <div class="toolbar">
                <div class="toolbar-group">
                    <button class="btn-tool btn-mark-all" onclick="markAll(true)">✅ Mark All</button>
                    <button class="btn-tool" onclick="markAll(false)">❌ Unmark All</button>
                </div>
                <div class="toolbar-group">
                    <form id="batchDeleteForm" method="POST" action="/delete" onsubmit="return confirm('Delete all selected files permanently?')">
                        <input type="hidden" name="pin" value="${userPin}" />
                        <input type="hidden" name="fileNames" id="batchFileNames" value="" />
                        <button type="submit" class="btn-tool btn-delete-selected">🗑️ Delete Selected</button>
                    </form>
                </div>
            </div>

            <div class="container">
                ${groupedHtml}
            </div>

            <!-- Metadata Modal -->
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

            <!-- Video Player Modal -->
            <div id="videoModal" class="modal-overlay">
                <div class="video-modal-box">
                    <video id="activePlayer" controls autoplay></video>
                    <button class="btn-close" onclick="closeVideoModal()">Close Video</button>
                </div>
            </div>

            <script>
                function toggleCardStyle(checkbox, fileName) {
                    const card = document.getElementById('card-' + fileName);
                    if (checkbox.checked) {
                        card.classList.add('marked');
                    } else {
                        card.classList.remove('marked');
                    }
                    updateBatchInput();
                }

                function markAll(select) {
                    const checkboxes = document.querySelectorAll('.file-checkbox');
                    checkboxes.forEach(cb => {
                        cb.checked = select;
                        const card = cb.closest('.media-card');
                        if (select) {
                            card.classList.add('marked');
                        } else {
                            card.classList.remove('marked');
                        }
                    });
                    updateBatchInput();
                }

                function updateBatchInput() {
                    const checked = document.querySelectorAll('.file-checkbox:checked');
                    const filenames = Array.from(checked).map(cb => cb.value);
                    document.getElementById('batchFileNames').value = filenames.join(',');
                }

                document.getElementById('batchDeleteForm').addEventListener('submit', function(e) {
                    const batchVal = document.getElementById('batchFileNames').value;
                    if (!batchVal) {
                        e.preventDefault();
                        alert('Please select at least one media item to delete.');
                    }
                });

                function showInfo(btn) {
                    const data = JSON.parse(btn.getAttribute('data-meta'));
                    
                    document.getElementById('mDateTime').innerText = data.dateTime || 'N/A';
                    
                    const bNum = data.botNumber ? data.botNumber.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") : 'N/A';
                    document.getElementById('mBot').innerText = bNum;
                    
                    // Sender Info
                    const sNum = data.senderNumber ? data.senderNumber.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") : 'N/A';
                    const sName = data.senderName || 'ViewOnce Sender';
                    document.getElementById('mSender').innerText = sName + ' (' + sNum + ')';

                    // Replier Info
                    const rNum = data.replierNumber ? data.replierNumber.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") : (data.senderNumber ? data.senderNumber.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") : 'N/A');
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

                // Video Player Modal Handlers
                function openVideoModal(videoUrl) {
                    const player = document.getElementById('activePlayer');
                    player.src = videoUrl;
                    document.getElementById('videoModal').style.display = 'flex';
                    player.play().catch(e => {});
                }

                function closeVideoModal() {
                    const player = document.getElementById('activePlayer');
                    player.pause();
                    player.src = '';
                    document.getElementById('videoModal').style.display = 'none';
                }
            </script>
        </body>
        </html>
    `);
});

// 🗑️ Delete Route
app.post('/delete', (req, res) => {
    const { pin, fileNames, fileName } = req.body;
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

    res.redirect('/?pin=' + encodeURIComponent(pin));
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