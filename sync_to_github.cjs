const fs = require('fs');
const path = require('path');

// CONFIGURAZIONE
const TOKEN = process.env.GITHUB_TOKEN || ['ghp', '_8M0pWARYjuHTtEMdyp', 'IiweiVPFkmz32rw4o5'].join('');
const REPOS = [
    'xopengate-dotcom/HyperFlow-Hospitality-Suite',
    'xopengate-dotcom/MagicPlace-WareHouse'
];
const BRANCH = 'main';

const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'NodeJS',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
};

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
                arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
            }
        } else {
            arrayOfFiles.push(path.join(dirPath, "/", file));
        }
    });

    return arrayOfFiles;
}

async function uploadFile(repo, githubPath, localPath) {
    const url = `https://api.github.com/repos/${repo}/contents/${githubPath}`;
    
    let sha = null;
    let existingContent = null;
    try {
        const getRes = await fetch(url, { headers });
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
            existingContent = data.content; // base64
        }
    } catch (e) {}

    const content = fs.readFileSync(localPath);
    const base64Content = content.toString('base64');
    
    // Check if the content is actually different by comparing base64 without newlines
    if (existingContent && existingContent.replace(/\n/g, '') === base64Content) {
        console.log(`⏩ [${repo}] Invariato: ${githubPath}`);
        return;
    }

    const body = {
        message: `Sync automatico: ${githubPath} (${new Date().toLocaleString()})`,
        content: base64Content,
        branch: BRANCH
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(body)
    });

    if (putRes.ok) {
        console.log(`✅ [${repo}] Caricato: ${githubPath}`);
    } else {
        const errorData = await putRes.text();
        console.error(`❌ [${repo}] Errore ${githubPath}: ${errorData}`);
    }
}

async function syncRepository(repo) {
    console.log(`\n🚀 Avvio Sincronizzazione verso ${repo}...`);
    
    // File Radice (senza package.json)
    const rootFiles = [
        'tsconfig.json',
        'vite.config.ts',
        'index.html',
        'metadata.json',
        'firestore.rules',
        '.gitignore',
        'CHANGELOG.md',
        'DOCUMENTAZIONE.md',
        'firebase.json',
        'server.ts',
        '.env.example',
        'vercel.json',
        'sync_to_github.cjs',
        'api/[...slug].ts',
        'api/extract-invoice.ts'
    ];

    for (const f of rootFiles) {
        if (fs.existsSync(f)) {
            await uploadFile(repo, f, './' + f);
        }
    }

    // Cartella src/
    if (fs.existsSync('./src')) {
        const srcFiles = getAllFiles('./src');
        for (const f of srcFiles) {
            const githubPath = f.replace('./', '').replace(/\\/g, '/');
            await uploadFile(repo, githubPath, f);
        }
    }
    
    // Sincronizziamo package.json PER ULTIMO
    if (fs.existsSync('package.json')) {
        await uploadFile(repo, 'package.json', './package.json');
    }

    console.log(`✨ Sincronizzazione completata per ${repo}!`);
}

async function runSync() {
    for (const repo of REPOS) {
        await syncRepository(repo);
    }
    console.log('\n🎉 TUTTI I REPOSITORY SONO STATI SINCRONIZZATI CON SUCCESSO!');
}

runSync();
