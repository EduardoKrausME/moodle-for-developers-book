(() => {
    const languages = navigator.languages?.length
        ? navigator.languages
        : [navigator.language || 'en'];

    const pathLanguage = location.pathname.match(/\/(pt_br|en)(?:\/|$)/i)?.[1]?.toLowerCase();

    const language = pathLanguage === 'pt_br' || pathLanguage === 'en'
        ? pathLanguage
        : languages.some(value => /^pt(?:-|$)/i.test(value))
            ? 'pt_br'
            : 'en';

    const i18n = {
        pt_br: {
            htmlLang: 'pt-BR',
            aria: 'Erro 404',
            title: 'Recurso não encontrado.',
            text: 'O Moodle iniciou corretamente, o plugin carregou, a capability passou... e a URL não existe. Pelo menos desta vez o erro não está no config.php.',
            back: 'Voltar ao livro',
            steps: [
                ['work', 'Criando plugin', 'local_moodledeveloper'],
                ['ok', 'Definindo componente', 'local_moodledeveloper'],
                ['ok', 'Carregando config.php', 'ambiente inicializado'],
                ['ok', 'Registrando autoload', 'classes/'],
                ['ok', 'Validando capability', 'acesso verificado'],
                ['work', 'Resolvendo rota', location.pathname],
                ['err', 'Acessando recurso', 'ERRO 404']
            ],
            status: {
                ok: '[OK]',
                err: '[ERRO]',
                work: '[....]'
            }
        },
        en: {
            htmlLang: 'en',
            aria: '404 error',
            title: 'Resource not found.',
            text: 'Moodle started correctly, the plugin loaded, the capability check passed... and the URL does not exist. At least this time the error is not in config.php.',
            back: 'Back to the book',
            steps: [
                ['work', 'Creating plugin', 'local_moodledeveloper'],
                ['ok', 'Defining component', 'local_moodledeveloper'],
                ['ok', 'Loading config.php', 'environment initialized'],
                ['ok', 'Registering autoload', 'classes/'],
                ['ok', 'Validating capability', 'access verified'],
                ['work', 'Resolving route', location.pathname],
                ['err', 'Accessing resource', 'ERROR 404']
            ],
            status: {
                ok: '[OK]',
                err: '[ERROR]',
                work: '[....]'
            }
        }
    };

    const strings = i18n[language];

    document.documentElement.lang = strings.htmlLang;
    document.querySelector('#terminal')?.setAttribute('aria-label', strings.aria);
    document.querySelector('#errorTitle').textContent = strings.title;
    document.querySelector('#errorText').innerHTML = esc(strings.text)
        .replace('config.php', '<code>config.php</code>');
    document.querySelector('#backLink').textContent = strings.back;

    const box = document.querySelector('#steps');

    strings.steps.forEach((step, index) => setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'line';
        line.innerHTML = `<span class="${step[0]}">${strings.status[step[0]]}</span><span>${esc(step[1])}</span><span class="dim">${esc(step[2])}</span>`;
        box.appendChild(line);
    }, index * 480));

    function esc(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character]));
    }
})();