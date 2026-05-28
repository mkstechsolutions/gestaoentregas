const API_URL = "https://script.google.com/macros/s/AKfycbzPTCj8gW_0VKINI866RFLt30V7RUOB3-ffqHKqMB4Co8DEZyo8tTYtKipUvlwVO4kK/exec";

// Cache local global dos dados brutos vindos da planilha para permitir filtros instantâneos offline
let dadosCacheados = null;
let meuGrafico = null;

document.addEventListener("DOMContentLoaded", () => {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById("ganho-data").value = hoje;
    document.getElementById("despesa-data").value = hoje;
});

function switchTab(tab) {
    document.getElementById("section-lancamento").classList.add("hidden");
    document.getElementById("section-dashboard").classList.add("hidden");
    document.getElementById("tab-lancamento").classList.remove("active-tab");
    document.getElementById("tab-dashboard").classList.remove("active-tab");

    if (tab === 'lancamento') {
        document.getElementById("section-lancamento").classList.remove("hidden");
        document.getElementById("tab-lancamento").classList.add("active-tab");
    } else if (tab === 'dashboard') {
        document.getElementById("section-dashboard").classList.remove("hidden");
        document.getElementById("tab-dashboard").classList.add("active-tab");
        carregarDadosDoDashboard();
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.classList.remove("hidden", "bg-emerald-600", "bg-rose-600");
    toast.classList.add(isError ? "bg-rose-600" : "bg-emerald-600");
    setTimeout(() => { toast.classList.add("hidden"); }, 4000);
}

// Atalho rápido para preenchimento dos valores comuns de despesa
function definirValorRapido(valor) {
    document.getElementById("despesa-valor").value = valor.toFixed(2);
}

// Recupera a meta salva no navegador ou retorna o padrão de R$ 200,00
function obterMetaAtual() {
    const metaSalva = localStorage.getItem("mks_meta_rua");
    if (metaSalva) {
        document.getElementById("escolha-meta").value = metaSalva;
        return parseFloat(metaSalva);
    }
    return 200.00;
}

// Atualiza a meta escolhida no localStorage e redesenha o painel na hora
function mudarMetaDefinida(novoValor) {
    localStorage.setItem("mks_meta_rua", novoValor);
    if (dadosCacheados) {
        renderizarPainelFiltrado();
    }
}

// Envio de faturamentos utilizando query strings estruturadas (Otimização Anti-CORS)
document.getElementById("form-ganho").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.innerText = "Salvando...";

    const payload = {
        action: "add_ganho",
        data: document.getElementById("ganho-data").value,
        app: document.getElementById("ganho-app").value,
        valor: document.getElementById("ganho-valor").value,
        km: document.getElementById("ganho-km").value
    };

    const params = new URLSearchParams(payload).toString();

    try {
        await fetch(`${API_URL}?${params}`, {
            method: "GET",
            mode: "no-cors"
        });
        
        showToast("Faturamento enviado para a Planilha!");
        document.getElementById("ganho-valor").value = "";
        document.getElementById("ganho-km").value = "";
        document.getElementById("ganho-app").selectedIndex = 0;
        dadosCacheados = null; // Invalida o cache local para forçar nova busca ao ir para o dash
    } catch (error) {
        showToast("Erro ao salvar dados.", true);
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Salvar Faturamento</span>`;
    }
});

// Envio de despesas utilizando query strings estruturadas
document.getElementById("form-despesa").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.innerText = "Salvando...";

    const payload = {
        action: "add_despesa",
        data: document.getElementById("despesa-data").value,
        tipo: document.getElementById("despesa-tipo").value,
        valor: document.getElementById("despesa-valor").value
    };

    const params = new URLSearchParams(payload).toString();

    try {
        await fetch(`${API_URL}?${params}`, {
            method: "GET",
            mode: "no-cors"
        });
        
        showToast("Despesa enviada para a Planilha!");
        document.getElementById("despesa-valor").value = "";
        document.getElementById("despesa-tipo").selectedIndex = 0;
        dadosCacheados = null; // Invalida o cache local
    } catch (error) {
        showToast("Erro ao salvar despesa.", true);
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Salvar Despesa</span>`;
    }
});

// Busca inicial da API e montagem dos seletores de meses de forma dinâmica
async function carregarDadosDoDashboard() {
    const syncIcon = document.getElementById("sync-icon");
    syncIcon.classList.add("fa-spin");

    try {
        const response = await fetch(API_URL);
        const dados = await response.json();

        if (dados.status === "error") {
            showToast("Erro ao ler dados da planilha", true);
            return;
        }

        // Armazena no cache local para manipulação rápida de filtros
        dadosCacheados = dados;
        
        // Atualiza as opções do filtro com base nos meses reais existentes nos dados
        atualizarOpcoesDeFiltro(dados);
        
        // Processa os dados usando o filtro atualmente selecionado (Geral por padrão)
        renderizarPainelFiltrado();

    } catch (error) {
        showToast("Erro de conexão com o banco online.", true);
        console.error(error);
    } finally {
        syncIcon.classList.remove("fa-spin");
    }
}

// Analisa os dados recebidos e adiciona os meses encontrados no input <select>
function atualizarOpcoesDeFiltro(dados) {
    const filtroSelect = document.getElementById("filtro-periodo");
    const valorSelecionado = filtroSelect.value; 
    
    filtroSelect.innerHTML = `
        <option value="geral">Todos os Registros (Geral)</option>
        <option value="atual">Mês Atual</option>
    `;

    const mesesDetectados = new Set();
    const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    const coletarMeses = (lista) => {
        lista.forEach(item => {
            if (item.data && item.data.includes('-')) {
                const parts = item.data.split('-'); // AAAA-MM-DD
                const anoMesKey = `${parts[0]}-${parts[1]}`; // Estrutura "AAAA-MM"
                mesesDetectados.add(anoMesKey);
            }
        });
    };

    coletarMeses(dados.ganhos);
    coletarMeses(dados.despesas);

    const mesesOrdenados = Array.from(mesesDetectados).sort((a, b) => b.localeCompare(a));

    mesesOrdenados.forEach(anoMes => {
        const [ano, mes] = anoMes.split('-');
        const nomeMes = mesesNomes[parseInt(mes, 10) - 1];
        const option = document.createElement("option");
        option.value = anoMes;
        option.innerText = `${nomeMes} de ${ano}`;
        filtroSelect.appendChild(option);
    });

    if ([...filtroSelect.options].some(opt => opt.value === valorSelecionado)) {
        filtroSelect.value = valorSelecionado;
    }
}

function filtrarDadosPorPeriodo() {
    if (!dadosCacheados) return;
    renderizarPainelFiltrado();
}

// Core da renderização que filtra o cache e monta os cálculos e gráficos do período selecionado
function renderizarPainelFiltrado() {
    const periodo = document.getElementById("filtro-periodo").value;
    
    const hoje = new Date();
    const anoAtualStr = hoje.getFullYear().toString();
    const mesAtualStr = String(hoje.getMonth() + 1).padStart(2, '0');
    const chaveMesAtual = `${anoAtualStr}-${mesAtualStr}`;

    const passaFiltro = (dataItem) => {
        if (!dataItem) return false;
        if (periodo === "geral") return true;
        
        const parts = dataItem.split('-'); 
        const chaveItem = `${parts[0]}-${parts[1]}`;

        if (periodo === "atual") {
            return chaveItem === chaveMesAtual;
        } else {
            return chaveItem === periodo;
        }
    };

    const ganhosFiltrados = dadosCacheados.ganhos.filter(g => passaFiltro(g.data));
    const despesasFiltradas = dadosCacheados.despesas.filter(d => passaFiltro(d.data));

    // Cálculos de Métricas Financeiras
    let totalGanho = 0;
    let totalKm = 0;
    let dadosAgrupadosPorData = {};
    let aplicativosDetectados = new Set();

    ganhosFiltrados.forEach(item => {
        const v = parseFloat(item.valor) || 0;
        const k = parseFloat(item.km) || 0;
        totalGanho += v;
        totalKm += k;

        const dataKey = item.data;
        if (!dadosAgrupadosPorData[dataKey]) {
            dadosAgrupadosPorData[dataKey] = {};
        }
        
        aplicativosDetectados.add(item.app);
        if (!dadosAgrupadosPorData[dataKey][item.app]) {
            dadosAgrupadosPorData[dataKey][item.app] = 0;
        }
        dadosAgrupadosPorData[dataKey][item.app] += v;
    });

    let totalGasolina = 0;
    let totalOutrasDespesas = 0;

    despesasFiltradas.forEach(item => {
        const v = parseFloat(item.valor) || 0;
        if (item.tipo === "Gasolina") {
            totalGasolina += v;
        } else {
            totalOutrasDespesas += v;
        }
    });

    const lucroLiquido = totalGanho - totalGasolina - totalOutrasDespesas;
    const ganhoPorKm = totalKm > 0 ? (totalGanho / totalKm) : 0;

    // Atualização da Interface Gráfica dos Cards
    document.getElementById("metric-lucro").innerText = `R$ ${lucroLiquido.toFixed(2).replace('.', ',')}`;
    document.getElementById("metric-km").innerText = `${totalKm.toFixed(1)} KM`;
    document.getElementById("metric-ganho-km").innerText = `R$ ${ganhoPorKm.toFixed(2).replace('.', ',')}`;
    document.getElementById("metric-combustivel").innerText = `R$ ${totalGasolina.toFixed(2).replace('.', ',')}`;

    // Atualização da Barra de Meta com Base no Seletor Dinâmico
    const META_DIARIA = obterMetaAtual();
    const percentualMeta = Math.min((totalGanho / META_DIARIA) * 100, 100);
    document.getElementById("barra-meta").style.width = `${percentualMeta}%`;
    document.getElementById("txt-meta-progresso").innerText = `R$ ${totalGanho.toFixed(2).replace('.', ',')} / R$ ${META_DIARIA.toFixed(0)}`;

    // Atualização da Lista Física de Lançamentos Recentes
    const historicoBox = document.getElementById("lista-historico");
    historicoBox.innerHTML = "";
    
    let unificados = [];
    ganhosFiltrados.forEach(g => unificados.push({tipo: 'ganho', desc: g.app, valor: g.valor, data: g.data, km: g.km}));
    despesasFiltradas.forEach(d => unificados.push({tipo: 'despesa', desc: d.tipo, valor: d.valor, data: d.data}));
    unificados.sort((a,b) => new Date(b.data) - new Date(a.data));

    if(unificados.length === 0) {
        historicoBox.innerHTML = `<p class="text-slate-500 text-center py-4">Nenhum registro encontrado neste período.</p>`;
    } else {
        unificados.slice(0, 15).forEach(item => {
            const div = document.createElement("div");
            div.className = "flex justify-between items-center p-2 rounded bg-slate-900 border border-slate-700/50";
            const dataFormatada = item.data.split('-').reverse().join('/');
            
            if (item.tipo === 'ganho') {
                div.innerHTML = `
                    <div>
                        <span class="text-emerald-400 font-semibold">[+] ${item.desc}</span>
                        <span class="text-slate-500 block text-[10px]">${dataFormatada} • ${item.km} KM</span>
                    </div>
                    <span class="text-emerald-400 font-bold">R$ ${parseFloat(item.valor).toFixed(2).replace('.', ',')}</span>
                `;
            } else {
                div.innerHTML = `
                    <div>
                        <span class="text-rose-400 font-semibold">[-] ${item.desc}</span>
                        <span class="text-slate-500 block text-[10px]">${dataFormatada}</span>
                    </div>
                    <span class="text-rose-400 font-bold">R$ ${parseFloat(item.valor).toFixed(2).replace('.', ',')}</span>
                `;
            }
            historicoBox.appendChild(div);
        });
    }

    // Configurações Finais e Desenho do Gráfico Customizado por Período
    const datasOrdenadas = Object.keys(dadosAgrupadosPorData).sort((a, b) => new Date(a) - new Date(b));
    const labelsDatasFormatadas = datasOrdenadas.map(data => data.split('-').reverse().slice(0, 2).join('/'));

    const coresDisponiveis = [
        { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
        { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
    ];

    let indiceCor = 0;
    const datasetsDinamicos = Array.from(aplicativosDetectados).map(app => {
        const cor = coresDisponiveis[indiceCor % coresDisponiveis.length];
        indiceCor++;
        const pontosData = datasOrdenadas.map(data => dadosAgrupadosPorData[data][app] || 0);
        return {
            label: app,
            data: pontosData,
            borderColor: cor.border,
            backgroundColor: cor.bg,
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: cor.border
        };
    });

    if (meuGrafico) {
        meuGrafico.destroy();
    }

    const ctx = document.getElementById('chartApps').getContext('2d');
    meuGrafico = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsDatasFormatadas,
            datasets: datasetsDinamicos
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 11 } }
                },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(51, 65, 85, 0.3)' },
                    ticks: { color: '#64748b', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(51, 65, 85, 0.3)' },
                    ticks: { color: '#64748b', font: { size: 10 } }
                }
            }
        }
    });
}