// Language toggle
let currentLang = 'en';

const langToggle = document.getElementById('langToggle');
langToggle.addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'es' : 'en';
    langToggle.textContent = currentLang === 'en' ? 'ES' : 'EN';
    updateLanguage();
});

function updateLanguage() {
    document.querySelectorAll('[data-en]').forEach(el => {
        el.textContent = el.getAttribute(`data-${currentLang}`);
    });
}

// GitHub profile image
fetch('https://api.github.com/users/ginozza')
    .then(res => res.json())
    .then(data => {
        document.getElementById('profileImage').src = data.avatar_url;
    })
    .catch(() => {
        document.getElementById('profileImage').style.display = 'none';
    });

// ── Realistic Black Hole Visualization ───────────────────────────
(function () {
    const canvas = document.getElementById('blackHoleCanvas');
    const ctx = canvas.getContext('2d');
    let W, H, cx, cy, time = 0;
    let incl = 1.18;        // viewing inclination (rad from pole)
    let azim = 0;            // azimuthal rotation
    let dragging = false;
    let lastMX = 0, lastMY = 0;

    // Physical scales (pixels)
    const RS = 55;                  // Schwarzschild radius
    const SHADOW = RS * 2.6;       // shadow apparent radius
    const ISCO = RS * 3;           // innermost stable circular orbit
    const DISK_OUT = RS * 8;       // outer disk edge

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
        cx = W / 2; cy = H / 2;
        genStars();
    }

    // ── Stars (typed arrays for performance) ─────────────────────
    const NS = 600;
    const sX = new Float32Array(NS), sY = new Float32Array(NS), sZ = new Float32Array(NS);
    const sS = new Float32Array(NS), sB = new Float32Array(NS);

    function genStars() {
        for (let i = 0; i < NS; i++) {
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            const r = 450 + Math.random() * 1000;
            sX[i] = r * Math.sin(ph) * Math.cos(th);
            sY[i] = r * Math.sin(ph) * Math.sin(th);
            sZ[i] = r * Math.cos(ph);
            sS[i] = Math.random() * 1.3 + 0.2;
            sB[i] = Math.random() * 0.5 + 0.25;
        }
    }

    function drawStars() {
        const ca = Math.cos(azim), sa = Math.sin(azim);
        const ci = Math.cos(incl), si = Math.sin(incl);
        for (let i = 0; i < NS; i++) {
            let x = sX[i], y = sY[i], z = sZ[i];
            // Rotate azimuth (around Y)
            let t = x * ca + z * sa; z = -x * sa + z * ca; x = t;
            // Rotate inclination (around X)
            t = y * ci - z * si; z = y * si + z * ci; y = t;
            if (z < -300) continue;
            const sc = 500 / (500 + z);
            let px = cx + x * sc, py = cy + y * sc;
            let dx = px - cx, dy = py - cy, d = Math.sqrt(dx * dx + dy * dy);
            if (d < SHADOW * 0.95) continue;
            // Gravitational lensing distortion
            if (d < SHADOW * 3.5) {
                const f = 1 + SHADOW * SHADOW / (d * d) * 0.4;
                px = cx + dx * f; py = cy + dy * f;
            }
            const alpha = sB[i] * Math.min(1, (500 + z) / 700);
            if (alpha <= 0) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(px, py, sS[i] * sc, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Accretion Disk ───────────────────────────────────────────
    // Rendered as concentric rings with temperature-based coloring,
    // Keplerian rotation, and gravitational lensing.
    const NRINGS = 50;
    const NSEG = 220;

    function diskColor(normR) {
        // Grayscale: inner = bright white, outer = dark gray
        const T = 1 - normR;
        const v = Math.min(255, (80 + T * 175)) | 0;
        return [v, v, v];
    }

    function drawDisk(behind) {
        const ca = Math.cos(azim), sa = Math.sin(azim);
        const ci = Math.cos(incl), si = Math.sin(incl);

        for (let ring = 0; ring < NRINGS; ring++) {
            const frac = ring / NRINGS;
            const radius = ISCO + (DISK_OUT - ISCO) * Math.pow(frac, 0.65);
            const normR = (radius - ISCO) / (DISK_OUT - ISCO);
            // Keplerian angular velocity: inner orbits faster
            const speed = 0.003 / Math.pow(radius / ISCO, 1.5);
            const phase = time * speed;

            const [cr, cg, cb] = diskColor(normR);
            const ringW = (DISK_OUT - ISCO) / NRINGS * (1 - normR * 0.3) * 0.95;
            const baseA = (1 - normR * 0.55) * 0.4 * (behind ? 0.45 : 1);

            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${Math.min(1, baseA)})`;
            ctx.lineWidth = ringW;
            ctx.beginPath();
            let drawing = false;

            for (let s = 0; s <= NSEG; s++) {
                const angle = (s / NSEG) * Math.PI * 2 + phase;
                let px = Math.cos(angle) * radius;
                let pz = Math.sin(angle) * radius;
                let py = 0;

                // Camera rotation
                let tmp = px * ca + pz * sa; pz = -px * sa + pz * ca; px = tmp;
                tmp = py * ci - pz * si; pz = py * si + pz * ci; py = tmp;

                // Depth ordering: front vs back of BH
                if ((pz < 0) !== behind) { drawing = false; continue; }

                // Perspective projection
                const sc = 500 / (500 + pz);
                let sx = cx + px * sc, sy = cy + py * sc;
                let dx = sx - cx, dy = sy - cy;
                let dist = Math.sqrt(dx * dx + dy * dy);

                // Gravitational lensing (stronger for back-side → visible arcs)
                if (dist > 1 && dist < SHADOW * 3) {
                    const bend = SHADOW * SHADOW / (dist * dist) * (behind ? 0.65 : 0.35);
                    sx = cx + dx * (1 + bend);
                    sy = cy + dy * (1 + bend);
                    dx = sx - cx; dy = sy - cy;
                    dist = Math.sqrt(dx * dx + dy * dy);
                }

                // Clip inside shadow
                if (dist < SHADOW * 0.92) { drawing = false; continue; }

                if (!drawing) { ctx.moveTo(sx, sy); drawing = true; }
                else ctx.lineTo(sx, sy);
            }

            ctx.stroke();

            // Glow layer (wider, softer)
            if (baseA > 0.05) {
                ctx.strokeStyle = `rgba(${cr},${cg},${cb},${Math.min(1, baseA * 0.18)})`;
                ctx.lineWidth = ringW * 2.8;
                ctx.stroke();
            }
        }
    }

    // ── Shadow & Photon Ring ─────────────────────────────────────
    function drawShadow() {
        // Ambient glow around shadow edge
        const g1 = ctx.createRadialGradient(cx, cy, SHADOW * 0.8, cx, cy, SHADOW * 1.6);
        g1.addColorStop(0, 'rgba(255,255,255,0.025)');
        g1.addColorStop(0.5, 'rgba(255,255,255,0.01)');
        g1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g1;
        ctx.beginPath();
        ctx.arc(cx, cy, SHADOW * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Hard event horizon shadow
        const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, SHADOW);
        g2.addColorStop(0, '#000');
        g2.addColorStop(0.88, '#000');
        g2.addColorStop(0.96, 'rgba(0,0,0,0.97)');
        g2.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(cx, cy, SHADOW, 0, Math.PI * 2);
        ctx.fill();

        // Photon ring (outer glow)
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.35)';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, SHADOW, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Secondary photon ring (inner)
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.15)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, SHADOW * 0.93, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // ── Animation Loop ───────────────────────────────────────────
    function frame() {
        time++;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // No auto-movement: only moves when user drags

        drawStars();
        drawDisk(true);       // back of disk (lensed arcs above/below shadow)
        drawShadow();
        drawDisk(false);      // front of disk

        requestAnimationFrame(frame);
    }

    // ── Mouse Controls ───────────────────────────────────────────
    canvas.addEventListener('mousedown', e => {
        dragging = true; lastMX = e.clientX; lastMY = e.clientY;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; canvas.style.cursor = 'grab'; }
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        azim -= (e.clientX - lastMX) * 0.005;
        incl = Math.max(0.3, Math.min(Math.PI - 0.3, incl + (e.clientY - lastMY) * 0.005));
        lastMX = e.clientX; lastMY = e.clientY;
    });

    // Touch controls disabled – scroll takes priority on mobile

    // ── Scroll Fade ──────────────────────────────────────────────
    window.addEventListener('scroll', () => {
        const s = window.scrollY, h = window.innerHeight;
        canvas.style.opacity = Math.max(0, 1 - s / h);
        canvas.classList.toggle('fade-out', s > h * 0.5);
    });

    window.addEventListener('resize', resize);

    // ── Init ─────────────────────────────────────────────────────
    canvas.style.cursor = 'grab';
    resize();
    frame();
})();

// GitHub API - Fetch projects
const repositories = [
    'ginozza/shrew',
    'ginozza/ml-analyst-sivigila',
    'ginozza/posix-sync-perf',
    'ginozza/JChess',
    'ginozza/blog-rust',
    'ginozza/Doom',
    'ginozza/netpher',
    'ginozza/trigonometric-parser'
];

const projectData = {
    'shrew': {
        type: 'featured',
        website: 'https://shrew.ink'
    },
    'posix-sync-perf': {
        paper: 'https://github.com/ginozza/posix-sync-perf/blob/main/Medici%C3%B3n%20de%20la%20eficiencia%20de%20mecanismos%20de%20sincronizaci%C3%B3n%20POSIX.pdf',
        type: 'academic'
    },
    'ml-analyst-sivigila': {
        type: 'academic'
    },
    'JChess': {
        type: 'personal'
    },
    'blog-rust': {
        type: 'personal'
    },
    'Doom': {
        type: 'personal'
    },
    'netpher': {
        type: 'personal'
    },
    'trigonometric-parser': {
        type: 'academic'
    }
};

async function fetchProjects() {
    const projectsGrid = document.getElementById('projectsGrid');
    projectsGrid.innerHTML = '';

    const projects = await Promise.all(
        repositories.map(async (repo) => {
            try {
                const response = await fetch(`https://api.github.com/repos/${repo}`);
                const data = await response.json();

                const langResponse = await fetch(`https://api.github.com/repos/${repo}/languages`);
                const languages = await langResponse.json();

                const repoName = repo.split('/')[1];
                const extraData = projectData[repoName] || { type: 'personal' };

                return {
                    name: data.name,
                    description: data.description || 'No description available',
                    url: data.html_url,
                    languages: Object.keys(languages),
                    paper: extraData.paper,
                    website: extraData.website,
                    type: extraData.type
                };
            } catch (error) {
                console.error(`Error fetching ${repo}:`, error);
                return null;
            }
        })
    );

    projects.filter(p => p !== null).forEach(project => {
        const card = document.createElement('div');
        card.className = project.type === 'featured' ? 'project-card featured' : 'project-card';

        let typeLabel;
        if (project.type === 'featured') {
            typeLabel = currentLang === 'en' ? '★ Featured' : '★ Destacado';
        } else {
            typeLabel = currentLang === 'en'
                ? (project.type === 'academic' ? 'Academic' : 'Personal')
                : (project.type === 'academic' ? 'Académico' : 'Personal');
        }

        const githubLabel = currentLang === 'en' ? 'GitHub' : 'GitHub';
        const paperLabel = currentLang === 'en' ? 'Paper' : 'Artículo';
        const websiteLabel = currentLang === 'en' ? 'Website' : 'Sitio Web';

        card.innerHTML = `
            <span class="project-tag ${project.type}">${typeLabel}</span>
            <h3>${project.name}</h3>
            <p>${project.description}</p>
            ${project.languages.length > 0 ? `
                <div class="project-tech">
                    ${project.languages.map(lang => `<span class="tech-tag">${lang}</span>`).join('')}
                </div>
            ` : ''}
            <div class="project-links">
                <a href="${project.url}" target="_blank" rel="noopener" class="project-link">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    <span>${githubLabel}</span>
                </a>
                ${project.website ? `
                    <a href="${project.website}" target="_blank" rel="noopener" class="project-link">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/>
                        </svg>
                        <span>${websiteLabel}</span>
                    </a>
                ` : ''}
                ${project.paper ? `
                    <a href="${project.paper}" target="_blank" rel="noopener" class="project-link">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
                            <path d="M6 5.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5z"/>
                        </svg>
                        <span>${paperLabel}</span>
                    </a>
                ` : ''}
            </div>
        `;

        projectsGrid.appendChild(card);
    });
}

fetchProjects();

// Update project labels when language changes
const originalUpdateLanguage = updateLanguage;
updateLanguage = function () {
    originalUpdateLanguage();
    fetchProjects();
};
