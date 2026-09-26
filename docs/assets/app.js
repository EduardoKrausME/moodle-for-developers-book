(() => {
    const CHAPTERS = {
        'Capitulo_01_Arquitetura_do_Moodle.md': 'Arquitetura do Moodle',
        'Capitulo_02_Tipos_de_Plugins_Moodle.md': 'Tipos de plugins Moodle',
        'Capitulo_03_Primeiro_Plugin_Corretamente.md': 'Primeiro plugin corretamente',
        'Capitulo_04_Qualidade_de_Codigo_desde_o_Inicio.md': 'Qualidade de código desde o início',
        'Capitulo_05_Banco_de_Dados_e_XMLDB.md': 'Banco de dados e XMLDB',
        'Capitulo_06_Interface_Moderna_e_Output_API.md': 'Interface moderna e Output API',
        'Capitulo_07_Forms_API.md': 'Forms API',
        'Capitulo_08_Seguranca.md': 'Segurança',
        'Capitulo_09_Files_API_e_Moodledata.md': 'Files API e Moodledata',
        'Capitulo_10_Events_Callbacks_e_Hooks.md': 'Events, callbacks e Hooks',
        'Capitulo_11_Cron_Tasks_e_Processamento_Assincrono.md': 'Cron, Tasks e processamento assíncrono',
        'Capitulo_12_Cache_e_Performance.md': 'Cache e performance',
        'Capitulo_13_APIs_Transversais_Essenciais.md': 'APIs transversais essenciais',
        'Capitulo_14_Web_Services_e_Integracoes.md': 'Web Services e integrações',
        'Capitulo_15_Plugin_Local.md': 'Plugin local',
        'Capitulo_16_Blocos.md': 'Blocos',
        'Capitulo_17_Modulos_de_Atividade.md': 'Módulos de atividade',
        'Capitulo_18_Plugins_de_Matricula.md': 'Plugins de matrícula',
        'Capitulo_19_Plugins_de_Autenticacao.md': 'Plugins de autenticação',
        'Capitulo_20_Subplugins.md': 'Subplugins',
        'Capitulo_21_Gradebook_e_Completion.md': 'Gradebook e Completion',
        'Capitulo_22_Question_Engine_e_Quiz.md': 'Question Engine e Quiz',
        'Capitulo_23_Privacy_API_e_GDPR.md': 'Privacy API e GDPR',
        'Capitulo_24_Backup_e_Restore.md': 'Backup e Restore',
        'Capitulo_25_PHPUnit.md': 'PHPUnit',
        'Capitulo_26_Behat.md': 'Behat',
        'Capitulo_27_Git_e_CI.md': 'Git e CI',
        'Capitulo_28_Seguranca_Ofensiva_Aplicada.md': 'Segurança ofensiva aplicada',
        'Capitulo_29_Compatibilidade_e_Manutencao_entre_Versoes.md': 'Compatibilidade e manutenção entre versões',
        'Capitulo_30_Projeto_Final.md': 'Projeto final'
    };

    const CHAPTERS_EN = {
        'Capitulo_01_Arquitetura_do_Moodle.md': 'Moodle architecture',
        'Capitulo_02_Tipos_de_Plugins_Moodle.md': 'Moodle plugin types',
        'Capitulo_03_Primeiro_Plugin_Corretamente.md': 'Your first plugin, done right',
        'Capitulo_04_Qualidade_de_Codigo_desde_o_Inicio.md': 'Code quality from the start',
        'Capitulo_05_Banco_de_Dados_e_XMLDB.md': 'Database and XMLDB',
        'Capitulo_06_Interface_Moderna_e_Output_API.md': 'Modern interface and Output API',
        'Capitulo_07_Forms_API.md': 'Forms API',
        'Capitulo_08_Seguranca.md': 'Security',
        'Capitulo_09_Files_API_e_Moodledata.md': 'Files API and Moodledata',
        'Capitulo_10_Events_Callbacks_e_Hooks.md': 'Events, callbacks and Hooks',
        'Capitulo_11_Cron_Tasks_e_Processamento_Assincrono.md': 'Cron, Tasks and asynchronous processing',
        'Capitulo_12_Cache_e_Performance.md': 'Cache and performance',
        'Capitulo_13_APIs_Transversais_Essenciais.md': 'Essential cross-cutting APIs',
        'Capitulo_14_Web_Services_e_Integracoes.md': 'Web Services and integrations',
        'Capitulo_15_Plugin_Local.md': 'Local plugin',
        'Capitulo_16_Blocos.md': 'Blocks',
        'Capitulo_17_Modulos_de_Atividade.md': 'Activity modules',
        'Capitulo_18_Plugins_de_Matricula.md': 'Enrolment plugins',
        'Capitulo_19_Plugins_de_Autenticacao.md': 'Authentication plugins',
        'Capitulo_20_Subplugins.md': 'Subplugins',
        'Capitulo_21_Gradebook_e_Completion.md': 'Gradebook and Completion',
        'Capitulo_22_Question_Engine_e_Quiz.md': 'Question Engine and Quiz',
        'Capitulo_23_Privacy_API_e_GDPR.md': 'Privacy API and GDPR',
        'Capitulo_24_Backup_e_Restore.md': 'Backup and Restore',
        'Capitulo_25_PHPUnit.md': 'PHPUnit',
        'Capitulo_26_Behat.md': 'Behat',
        'Capitulo_27_Git_e_CI.md': 'Git and CI',
        'Capitulo_28_Seguranca_Ofensiva_Aplicada.md': 'Applied offensive security',
        'Capitulo_29_Compatibilidade_e_Manutencao_entre_Versoes.md': 'Compatibility and maintenance across versions',
        'Capitulo_30_Projeto_Final.md': 'Final project'
    };

    const LANGUAGE = window.BOOK_LANGUAGE === 'en' ? 'en' : 'pt_br';
    const TEXT = {
        pt_br: {
            chapters: 'capítulos',
            light: '☀ Claro',
            dark: '☾ Escuro',
            code: 'código',
            copy: 'Copiar',
            copied: 'Copiado',
            openImage: '⛶ Ampliar imagem',
            closeImage: 'Fechar imagem',
            openOriginal: '↗ Abrir original em nova aba',
            loading: 'Carregando capítulo…',
            chapter: 'CAPÍTULO',
            reading: 'min de leitura',
            sections: 'seções',
            words: 'palavras',
            previous: '← capítulo anterior',
            next: 'próximo capítulo →',
            loadError: 'Não foi possível carregar o capítulo.',
            confirm: 'Confirme se',
            repository: 'está no mesmo repositório publicado pelo GitHub Pages.',
            codeStyleError: 'Não foi possível carregar o codestyle online.',
            locale: 'pt-BR'
        },
        en: {
            chapters: 'chapters',
            light: '☀ Light',
            dark: '☾ Dark',
            code: 'code',
            copy: 'Copy',
            copied: 'Copied',
            openImage: '⛶ Enlarge image',
            closeImage: 'Close image',
            openOriginal: '↗ Open original in new tab',
            loading: 'Loading chapter…',
            chapter: 'CHAPTER',
            reading: 'min read',
            sections: 'sections',
            words: 'words',
            previous: '← previous chapter',
            next: 'next chapter →',
            loadError: 'The chapter could not be loaded.',
            confirm: 'Check that',
            repository: 'is in the same repository published by GitHub Pages.',
            codeStyleError: 'The online code style could not be loaded.',
            locale: 'en-US'
        }
    }[LANGUAGE];

    if (LANGUAGE === 'en') {
        Object.assign(CHAPTERS, CHAPTERS_EN);
    }

    const state = {
        current: null,
        readerSize: Number(localStorage.getItem('readerSize') || 17),
        tocScrollHandler: null
    };

    const qs = s => document.querySelector(s);
    const qsa = s => [...document.querySelectorAll(s)];

    const pad = n => String(n).padStart(2, '0');

    const CODESTYLE = {
        css: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.30.0/themes/prism-tomorrow.min.css',
        core: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.30.0/components/prism-core.min.js',
        autoloader: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.30.0/plugins/autoloader/prism-autoloader.min.js',
        languages: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.30.0/components/'
    };

    let codeStylePromise = null;

    const codeLanguage = lang => ({
        html: 'markup',
        htm: 'markup',
        xml: 'markup',
        mustache: 'handlebars',
        hbs: 'handlebars',
        handlebars: 'handlebars',
        php: 'php'
    }[lang] || lang);

    const esc = s => String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

    const slug = s => s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const chapter = id => {
        const n = Number(id);
        const entries = Object.entries(CHAPTERS);

        if (n < 1 || n > entries.length) {
            return null;
        }

        const [file, title] = entries[n - 1];

        return {
            id: pad(n),
            number: n,
            title,
            file: `chapters/${file}`,
            url: file.replace(/\.md$/i, '.html')
        };
    };

    function detectChapter() {
        const currentPage = decodeURIComponent(
            location.pathname.split('/').pop() || ''
        );

        const files = Object.keys(CHAPTERS);
        const pageIndex = files.findIndex(
            file => file.replace(/\.md$/i, '.html') === currentPage
        );

        if (pageIndex !== -1) {
            return pad(pageIndex + 1);
        }

        const p = new URLSearchParams(location.search).get('chapters');

        if (p) {
            return pad(p);
        }

        const h = location.hash.match(/chapters[=\/-]?(\d{1,2})/i);

        if (h) {
            return pad(h[1]);
        }

        return '01';
    }

    function setTheme(theme) {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('bookTheme', theme);

        qs('#themeBtn').textContent =
            theme === 'dark' ? TEXT.light : TEXT.dark;
    }

    function initTheme() {
        const saved = localStorage.getItem('bookTheme');

        setTheme(
            saved ||
            (
                matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark'
                    : 'light'
            )
        );
    }

    function renderSidebar() {
        const list = qs('#chapterList');

        list.innerHTML = Object.entries(CHAPTERS)
            .map(([file, title], i) => {
                const c = chapter(i + 1);

                return `
                    <li>
                        <a
                            class="chapter-link"
                            data-chapter="${c.id}"
                            href="${c.url}"
                        >
                            <span class="num">${c.id}</span>
                            <span>${esc(title)}</span>
                        </a>
                    </li>
                `;
            })
            .join('');

        qs('#count').textContent =
            `${Object.keys(CHAPTERS).length} ${TEXT.chapters}`;

        list.addEventListener('click', e => {
            const a = e.target.closest('a[data-chapter]');

            if (!a) {
                return;
            }

            e.preventDefault();

            navigate(a.dataset.chapter, true);
        });
    }

    function resolveMarkdownUrl(url) {
        const value = String(url)
            .trim()
            .replace(/^<|>$/g, '');

        if (!value) {
            return '';
        }

        if (/^(?:#|mailto:|tel:)/i.test(value)) {
            return value;
        }

        try {
            const base = state.current
                ? new URL(state.current.file, location.href)
                : new URL(location.href);

            const resolved = new URL(value, base);

            if (!/^https?:$/.test(resolved.protocol)) {
                return '';
            }

            return resolved.href;
        } catch (err) {
            return '';
        }
    }

    function markdownLink(content, url) {
        const href = resolveMarkdownUrl(url);

        if (!href) {
            return content;
        }

        let external = false;

        try {
            external = new URL(href, location.href).origin !== location.origin;
        } catch (err) {
            external = false;
        }

        return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${content}</a>`;
    }

    function markdownImage(alt, url) {
        const src = resolveMarkdownUrl(url);

        if (!src) {
            return esc(alt);
        }

        return `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
    }

    function inline(s) {
        const stash = [];

        const hold = x =>
            `\u0000${stash.push(x) - 1}\u0000`;

        s = s.replace(
            /`([^`]+)`/g,
            (_, x) => hold(`<code>${esc(x)}</code>`)
        );

        s = s.replace(
            /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g,
            (_, alt, src, href) => hold(
                markdownLink(
                    markdownImage(alt, src),
                    href
                )
            )
        );

        s = s.replace(
            /!\[([^\]]*)\]\(([^)]+)\)/g,
            (_, alt, src) => hold(
                markdownImage(alt, src)
            )
        );

        s = s.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (_, t, u) => hold(
                markdownLink(esc(t), u)
            )
        );

        s = s.replace(
            /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
            (m, p, u) =>
                `${p}${hold(
                    markdownLink(esc(u), u)
                )}`
        );

        s = esc(s);

        s = s
            .replace(
                /\*\*([^*]+)\*\*/g,
                '<strong>$1</strong>'
            )
            .replace(
                /(^|\s)\*([^*]+)\*(?=\s|[.,;:!?]|$)/g,
                '$1<em>$2</em>'
            );

        return s.replace(
            /\u0000(\d+)\u0000/g,
            (_, i) => stash[Number(i)]
        );
    }

    function markdown(md) {
        const lines = md
            .replace(/\r/g, '')
            .split('\n');

        let out = [];
        let i = 0;
        let paragraph = [];
        let list = null;
        const headingIds = new Map();

        const flushP = () => {
            if (paragraph.length) {
                out.push(
                    `<p>${inline(paragraph.join(' '))}</p>`
                );

                paragraph = [];
            }
        };

        const closeList = () => {
            if (list) {
                out.push(`</${list}>`);
                list = null;
            }
        };

        while (i < lines.length) {
            let line = lines[i];

            if (/^```+/.test(line)) {
                flushP();
                closeList();

                const fence = line.match(/^(```+)/)[1];

                const lang = line
                    .slice(fence.length)
                    .trim()
                    .toLowerCase();

                const highlightLang = codeLanguage(lang);

                i++;

                let code = [];

                while (
                    i < lines.length &&
                    !lines[i].startsWith(fence)
                    ) {
                    code.push(lines[i++]);
                }

                i++;

                out.push(`
                    <div class="code-wrap">
                        <div class="code-head">
                            <span>${esc(lang || TEXT.code)}</span>

                            <button
                                class="copy-code"
                                type="button"
                            >
                                ${TEXT.copy}
                            </button>
                        </div>

                        <pre><code
                            data-raw="${encodeURIComponent(code.join('\n'))}"
                            class="language-${esc(highlightLang)}"
                        >${esc(code.join('\n'))}</code></pre>
                    </div>
                `);

                continue;
            }

            const hm = line.match(/^(#{1,4})\s+(.+)$/);

            if (hm) {
                flushP();
                closeList();

                const lev = hm[1].length;
                const txt = hm[2].trim();
                const baseId = slug(txt) || `secao-${i + 1}`;
                const seen = headingIds.get(baseId) || 0;
                const id = seen ? `${baseId}-${seen + 1}` : baseId;

                headingIds.set(baseId, seen + 1);

                out.push(
                    `<h${lev} id="${id}">${inline(txt)}</h${lev}>`
                );

                i++;

                continue;
            }

            if (/^>\s?/.test(line)) {
                flushP();
                closeList();

                out.push(
                    `<p class="quote">${inline(
                        line.replace(/^>\s?/, '')
                    )}</p>`
                );

                i++;

                continue;
            }

            let lm = line.match(
                /^\s*[-*+]\s+(.+)$/
            );

            let om = line.match(
                /^\s*\d+[.)]\s+(.+)$/
            );

            if (lm || om) {
                flushP();

                const type = om ? 'ol' : 'ul';

                if (list !== type) {
                    closeList();

                    out.push(`<${type}>`);

                    list = type;
                }

                out.push(
                    `<li>${inline((lm || om)[1])}</li>`
                );

                i++;

                continue;
            }

            if (!line.trim()) {
                flushP();
                closeList();

                i++;

                continue;
            }

            if (/^---+$/.test(line.trim())) {
                flushP();
                closeList();

                out.push('<hr>');

                i++;

                continue;
            }

            paragraph.push(
                line.trim()
            );

            i++;
        }

        flushP();
        closeList();

        return out.join('\n');
    }

    function buildToc() {
        const hs = qsa(
            '#chapterBody h2, #chapterBody h3'
        );

        const toc = qs('#toc');

        toc.innerHTML = hs.map(h => `
            <a
                class="${h.tagName === 'H3' ? 'sub' : ''}"
                href="#${h.id}"
            >
                ${esc(h.textContent)}
            </a>
        `).join('');

        toc.onclick = e => {
            const a = e.target.closest('a');

            if (!a) {
                return;
            }

            e.preventDefault();

            const hash = a.getAttribute('href');
            const target = document.getElementById(
                decodeURIComponent(hash.slice(1))
            );

            if (!target) {
                return;
            }

            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            history.replaceState(
                history.state,
                '',
                location.pathname +
                location.search +
                hash
            );
        };

        if (state.tocScrollHandler) {
            removeEventListener(
                'scroll',
                state.tocScrollHandler
            );
        }

        let ticking = false;

        state.tocScrollHandler = () => {
            if (ticking) {
                return;
            }

            ticking = true;

            requestAnimationFrame(() => {
                const topOffset = 118;
                let active = hs[0] || null;

                hs.forEach(h => {
                    if (
                        h.getBoundingClientRect().top <= topOffset
                    ) {
                        active = h;
                    }
                });

                qsa('#toc a').forEach(a => {
                    a.classList.toggle(
                        'active',
                        Boolean(active) &&
                        a.getAttribute('href') === `#${active.id}`
                    );
                });

                ticking = false;
            });
        };

        addEventListener(
            'scroll',
            state.tocScrollHandler,
            {
                passive: true
            }
        );

        state.tocScrollHandler();
    }

    async function loadChapter(id) {
        const c = chapter(id);

        if (!c) {
            location.href = '404.html';
            return;
        }

        state.current = c;

        qs('#chapterBody').innerHTML = `
            <div class="loading">
                <span class="loading-dot"></span>
                ${TEXT.loading}
            </div>
        `;

        qsa('.chapter-link').forEach(a =>
            a.classList.toggle(
                'active',
                a.dataset.chapter === c.id
            )
        );

        try {
            const res = await fetch(
                c.file,
                {
                    cache: 'no-cache'
                }
            );

            if (!res.ok) {
                throw new Error(
                    `HTTP ${res.status}`
                );
            }

            const md = (await res.text())
                .replace(/^\s*{%\s*(?:raw|endraw)\s*%}\s*$/gmi, '');

            const words = md
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .length;

            const sections = (
                md.match(/^##+\s+/gm) || []
            ).length;

            const minutes = Math.max(
                1,
                Math.ceil(words / 210)
            );

            const first = md.match(
                /^#\s+(.+)$/m
            );

            const title = first
                ? first[1]
                    .replace(/^\d+\s+/, '')
                    .trim()
                : c.title;

            qs('#chapterLabel').textContent =
                `${TEXT.chapter} ${c.id}`;

            qs('#chapterTitle').textContent =
                title;

            qs('#meta').textContent =
                `${minutes} ${TEXT.reading} · ` +
                `${sections} ${TEXT.sections} · ` +
                `${words.toLocaleString(TEXT.locale)} ${TEXT.words}`;

            document.title =
                `${c.id} · ${title} — Moodle Developer`;

            qs('#chapterBody').innerHTML =
                markdown(md);

            buildToc();
            buildNav(c);
            bindCode();
            bindRenderedImages();

            const sectionId = location.hash
                ? decodeURIComponent(location.hash.slice(1))
                : '';

            const section = sectionId
                ? document.getElementById(sectionId)
                : null;

            if (section) {
                requestAnimationFrame(() => {
                    section.scrollIntoView({
                        behavior: 'auto',
                        block: 'start'
                    });

                    state.tocScrollHandler?.();
                    updateProgress();
                });
            } else {
                window.scrollTo({
                    top: 0,
                    behavior: 'instant'
                });

                state.tocScrollHandler?.();
                updateProgress();
            }
        } catch (err) {
            qs('#chapterBody').innerHTML = `
                <div class="error-box">
                    <strong>
                        ${TEXT.loadError}
                    </strong>

                    <p>
                        ${esc(err.message)}
                    </p>

                    <p>
                        ${TEXT.confirm}
                        <code>${esc(c.file)}</code>
                        ${TEXT.repository}
                    </p>
                </div>
            `;
        }
    }

    function buildNav(c) {
        const prev = chapter(
            c.number - 1
        );

        const next = chapter(
            c.number + 1
        );

        qs('#chapterNav').innerHTML = `
            ${
            prev
                ? `
                        <a
                            href="${prev.url}"
                            data-chapter="${prev.id}"
                            class="nav-card"
                        >
                            <small>
                                ${TEXT.previous}
                            </small>

                            <strong>
                                ${prev.id} · ${esc(prev.title)}
                            </strong>
                        </a>
                    `
                : '<span></span>'
        }

            ${
            next
                ? `
                        <a
                            href="${next.url}"
                            data-chapter="${next.id}"
                            class="nav-card next"
                        >
                            <small>
                                ${TEXT.next}
                            </small>

                            <strong>
                                ${next.id} · ${esc(next.title)}
                            </strong>
                        </a>
                    `
                : ''
        }
        `;

        qs('#chapterNav').onclick = e => {
            const a = e.target.closest(
                '[data-chapter]'
            );

            if (!a) {
                return;
            }

            e.preventDefault();

            navigate(
                a.dataset.chapter,
                true
            );
        };
    }

    function loadCodeStyleAsset(type, id, url) {
        const current = document.getElementById(id);

        if (current) {
            return Promise.resolve(current);
        }

        return new Promise((resolve, reject) => {
            const el = document.createElement(type);

            el.id = id;

            if (type === 'link') {
                el.rel = 'stylesheet';
                el.href = url;
            } else {
                el.src = url;
                el.defer = true;
            }

            el.onload = () => resolve(el);
            el.onerror = () => reject(
                new Error(`Falha ao carregar ${url}`)
            );

            document.head.appendChild(el);
        });
    }

    async function applyOnlineCodeStyle() {
        const blocks = qsa(
            '#chapterBody code.language-php, ' +
            '#chapterBody code.language-markup, ' +
            '#chapterBody code.language-handlebars'
        );

        if (!blocks.length) {
            return;
        }

        try {
            if (!codeStylePromise) {
                window.Prism = window.Prism || {};
                window.Prism.manual = true;

                codeStylePromise = Promise.all([
                    loadCodeStyleAsset(
                        'link',
                        'online-codestyle-theme',
                        CODESTYLE.css
                    ),
                    loadCodeStyleAsset(
                        'script',
                        'online-codestyle-core',
                        CODESTYLE.core
                    )
                ]).then(async () => {
                    await loadCodeStyleAsset(
                        'script',
                        'online-codestyle-autoloader',
                        CODESTYLE.autoloader
                    );

                    if (
                        window.Prism?.plugins?.autoloader
                    ) {
                        window.Prism.plugins.autoloader.languages_path =
                            CODESTYLE.languages;
                    }
                });
            }

            await codeStylePromise;

            blocks.forEach(code => {
                if (document.contains(code)) {
                    window.Prism.highlightElement(code);
                }
            });
        } catch (err) {
            console.warn(
                TEXT.codeStyleError,
                err
            );
        }
    }


    function getImageModal() {
        let modal = qs('#imageModal');

        if (modal) {
            return modal;
        }

        modal = document.createElement('dialog');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.setAttribute(
            'aria-label',
            TEXT.closeImage
        );

        modal.innerHTML = `
            <div class="image-modal-toolbar">
                <a
                    class="image-modal-original"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    ${TEXT.openOriginal}
                </a>

                <button
                    type="button"
                    class="image-modal-close"
                    aria-label="${esc(TEXT.closeImage)}"
                >
                    ×
                </button>
            </div>

            <div class="image-modal-body">
                <img alt="">
            </div>
        `;

        modal.querySelector(
            '.image-modal-close'
        ).onclick = () => modal.close();

        modal.addEventListener('click', e => {
            if (e.target === modal) {
                modal.close();
            }
        });

        document.body.appendChild(modal);

        return modal;
    }

    function openImageModal(url, alt) {
        const modal = getImageModal();
        const image = modal.querySelector(
            '.image-modal-body img'
        );
        const original = modal.querySelector(
            '.image-modal-original'
        );

        image.src = url;
        image.alt = alt || '';
        original.href = url;

        if (!modal.open) {
            modal.showModal();
        }
    }

    function bindRenderedImages() {
        qsa('#chapterBody img').forEach(img => {
            const link = img.parentElement?.tagName === 'A'
                ? img.parentElement
                : null;

            const content = link || img;
            const paragraph = content.parentElement;

            if (
                !paragraph ||
                paragraph.tagName !== 'P' ||
                paragraph.children.length !== 1 ||
                paragraph.textContent.trim() ||
                paragraph.dataset.imageActions === 'true'
            ) {
                return;
            }

            const url =
                img.currentSrc ||
                img.src;

            if (!url) {
                return;
            }

            paragraph.dataset.imageActions = 'true';
            img.classList.add('image-zoomable');

            content.addEventListener('click', e => {
                e.preventDefault();
                openImageModal(
                    url,
                    img.alt
                );
            });

            const actions = document.createElement('span');

            actions.className = 'tools';
            actions.style.marginBottom = '10px';

            const button = document.createElement('button');

            button.type = 'button';
            button.className = 'icon-btn';
            button.textContent = TEXT.openImage;
            button.setAttribute(
                'aria-label',
                TEXT.openImage
            );

            button.onclick = () => openImageModal(
                url,
                img.alt
            );

            actions.appendChild(button);
            paragraph.insertBefore(
                actions,
                content
            );
        });
    }

    function bindCode() {
        applyOnlineCodeStyle();

        qsa('.copy-code').forEach(b => {
            b.onclick = async () => {
                const code = b
                    .closest('.code-wrap')
                    .querySelector('code');

                await navigator.clipboard.writeText(
                    decodeURIComponent(
                        code.dataset.raw || ''
                    )
                );

                const old = b.textContent;

                b.textContent = TEXT.copied;

                setTimeout(
                    () => {
                        b.textContent = old;
                    },
                    1200
                );
            };
        });
    }

    function navigate(id, push) {
        const c = chapter(id);

        if (!c) {
            return;
        }

        if (push) {
            history.pushState(
                {
                    chapter: c.id
                },
                '',
                c.url
            );
        }

        document.body.classList.remove(
            'menu-open'
        );

        loadChapter(
            c.id
        );
    }

    function updateProgress() {
        const doc =
            document.documentElement;

        const den =
            doc.scrollHeight - innerHeight;

        qs('#progress').style.width =
            (
                den > 0
                    ? Math.min(
                        100,
                        scrollY / den * 100
                    )
                    : 0
            ) + '%';
    }

    function init() {
        initTheme();
        renderSidebar();

        document.documentElement.style.setProperty(
            '--reader-size',
            state.readerSize + 'px'
        );

        qs('#themeBtn').onclick = () =>
            setTheme(
                document.documentElement.dataset.theme === 'dark'
                    ? 'light'
                    : 'dark'
            );

        qs('#menuBtn').onclick = () =>
            document.body.classList.toggle(
                'menu-open'
            );

        qs('#fontMinus').onclick = () => {
            state.readerSize = Math.max(
                14,
                state.readerSize - 1
            );

            document.documentElement.style.setProperty(
                '--reader-size',
                state.readerSize + 'px'
            );

            localStorage.setItem(
                'readerSize',
                state.readerSize
            );
        };

        qs('#fontPlus').onclick = () => {
            state.readerSize = Math.min(
                23,
                state.readerSize + 1
            );

            document.documentElement.style.setProperty(
                '--reader-size',
                state.readerSize + 'px'
            );

            localStorage.setItem(
                'readerSize',
                state.readerSize
            );
        };

        addEventListener(
            'scroll',
            updateProgress,
            {
                passive: true
            }
        );

        addEventListener(
            'popstate',
            () => loadChapter(
                detectChapter()
            )
        );

        loadChapter(
            detectChapter()
        );
    }

    init();
})();
