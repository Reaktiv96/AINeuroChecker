import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  RefreshCw, 
  FileCode, 
  FileText,
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  BookOpen, 
  Code2,
  Table as TableIcon,
  Layout,
  Settings,
  Send,
  Plus,
  Trash2,
  BarChart3 as BarChartIcon,
  Download,
  History,
  Wand2,
  Brain,
  Square,
  TrendingUp,
  ArrowUpRight,
  Activity,
  Scissors,
  Sparkles,
  Copy,
  Check,
  Save,
  X,
  Sliders,
  HelpCircle,
  FileSpreadsheet,
  Layers,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LineChart,
  Line
} from 'recharts';

// --- Types ---
interface TestResult {
  type: string;
  student_code: string;
  expected_grade: number;
  actual_grade?: number;
  comment?: string;
  change_summary?: string;
  full_feedback?: any;
}

interface CheckResponse {
  overall_score: number;
  overall_comment: string;
  homework_tasks: any[];
  topic?: string;
  additional_recommendations?: string;
}

interface UsageLog {
  email: string;
  timestamp: string;
  tokens: number;
  cost_rub: number;
  action: string;
}

interface SavedRun {
  id: string;
  timestamp: string;
  taskType: 'code' | 'text';
  etalonLink: string;
  etalonText: string;
  tema: string;
  zadaniya: string[];
  numCorrect: number | '';
  numIncorrect: number | '';
  model: string;
  forceSelectedTypes: boolean;
  selectedTypes: string[];
  additionalColabs: { link: string, name: string, expected_grade: number }[];
  testCases: TestResult[];
  results: Record<number, TestResult[]>;
  checkingLogs: { id: string; text: string; type: 'info' | 'success' | 'warning' | 'error' | 'pending'; timestamp: string }[];
  totalCost: number;
}

// --- Components ---

const MonacoPlaceholder = ({ code, onRun }: { code: string, onRun: (c: string) => void }) => {
  return (
    <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-900 font-mono text-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-slate-400 flex items-center gap-2 italic">
          <Code2 className="w-4 h-4" /> python_preview.py
        </span>
        <button 
          onClick={() => onRun(code)}
          className="flex items-center gap-2 px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded transition-colors text-xs font-semibold"
        >
          <Play className="w-3 h-3 fill-current" /> Run
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-slate-100 max-h-64 scrollbar-thin scrollbar-thumb-slate-700">
        {code}
      </pre>
    </div>
  );
};

export default function App() {
  const getInitialConfig = () => {
    const saved = localStorage.getItem('neurochecker_v3_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse config', e);
      }
    }
    return null;
  };

  const initialConfig = getInitialConfig();

  const [taskType, setTaskType] = useState<'code' | 'text'>(initialConfig?.taskType || 'code');
  const [etalonLink, setEtalonLink] = useState(initialConfig?.etalonLink || '');
  const [etalonText, setEtalonText] = useState(initialConfig?.etalonText || '');
  const [tema, setTema] = useState(initialConfig?.tema || '');
  const [zadaniya, setZadaniya] = useState<string[]>(() => {
    const init = initialConfig?.zadaniya;
    return Array.isArray(init) ? init : [];
  });
  const [numCorrect, setNumCorrect] = useState<number | ''>(initialConfig?.numCorrect ?? '');
  const [numIncorrect, setNumIncorrect] = useState<number | ''>(initialConfig?.numIncorrect ?? '');
  const [model, setModel] = useState(initialConfig?.model || 'gpt-4o');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    const init = initialConfig?.selectedTypes;
    return Array.isArray(init) ? init : [];
  });
  const [forceSelectedTypes, setForceSelectedTypes] = useState(initialConfig?.forceSelectedTypes || false);
  
  const caseTypes = [
    { id: 'non_optimal', label: 'Non-optimal' },
    { id: 'logical_error', label: 'Logical Error' },
    { id: 'syntax_error', label: 'Syntax Error' },
    { id: 'partial', label: 'Partial Solution' },
    { id: 'cheating', label: 'Cheating' }
  ];

  const [additionalColabs, setAdditionalColabs] = useState<{ link: string, name: string, expected_grade: number }[]>(() => {
    const init = initialConfig?.additionalColabs;
    return Array.isArray(init) ? init : [];
  });
  const [secrets, setSecrets] = useState<Record<string, string>>(() => {
    const saved = initialConfig?.secrets;
    if (typeof saved === 'object' && saved !== null) return saved;
    return {};
  });

  const [newSecretKey, setNewSecretKey] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [testCases, setTestCases] = useState<TestResult[]>([]);
  const [results, setResults] = useState<Record<number, TestResult[]>>({});
  const [activeTaskIdx, setActiveTaskIdx] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [activeFeedback, setActiveFeedback] = useState<TestResult | null>(null);
  const [activeSummary, setActiveSummary] = useState<TestResult | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'analytics' | 'logs' | 'prompts' | 'history' | 'optimization'>('code');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [optLogs, setOptLogs] = useState<string[]>([]);
  const [optStage, setOptStage] = useState<string>('idle'); // idle, generating, evaluating, judge, finished
  const [optIteration, setOptIteration] = useState<number>(0);
  const [optHistory, setOptHistory] = useState<any[]>([]);
  const [optStopRequested, setOptStopRequested] = useState<boolean>(false);
  const optStopRequestedRef = useRef<boolean>(false); // using ref for immediate sync access in loop
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [executionOutput, setExecutionOutput] = useState<string>('');
  
  const [forceOptRegenerate, setForceOptRegenerate] = useState(false);
  const [isOptResultModalOpen, setIsOptResultModalOpen] = useState(false);
  const [copiedOptResultPrompt, setCopiedOptResultPrompt] = useState(false);

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runsHistory, setRunsHistory] = useState<SavedRun[]>(() => {
    const saved = localStorage.getItem('neurochecker_v3_runs_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Failed to parse runs history', e);
      }
    }
    return [];
  });
  const [prompts, setPrompts] = useState<{id: string, name: string, content: string, description: string}[]>([]);
  const [pyodide, setPyodide] = useState<any>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // --- Prompt Compressor & Templates State ---
  const [isCompressModalOpen, setIsCompressModalOpen] = useState(false);
  const [rawHomeworkInput, setRawHomeworkInput] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('template_goal');
  const [customTemplateInput, setCustomTemplateInput] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressResult, setCompressResult] = useState<{
    compressed_prompt: string;
    explanation: string;
    original_char_count: number;
    compressed_char_count: number;
    reduction_percent: number;
    tokens_used?: number;
  } | null>(null);
  const [copiedCompressResult, setCopiedCompressResult] = useState(false);

  // Pre-defined & User Custom Prompt Templates
  const defaultPromptTemplates = [
    {
      id: 'template_goal',
      name: '1. Блок <goal> (Критериальный)',
      description: 'Лаконичная структура в тегах <goal> с критериями оценок (0, 2, 10)',
      content: `<goal>
Цель: Проверить решение задания [Тема / Название].
Требования к решению:
- Использованы требуемые библиотеки и корректные методы.
- Выполнены все основные пункты постановки задачи.
- Получен верный итоговый результат.

Критерии оценки:
- 10 баллов: Задание выполнено идеально, результат верен.
- 2 балла: Есть логические ошибки, код не запускается или итоговый результат неверный.
- 0 баллов: Задание полностью отсутствует.
</goal>`
    },
    {
      id: 'template_checklist',
      name: '2. Нумерованный Чек-лист',
      description: 'Строгий список проверочных пунктов без лишнего текста',
      content: `<goal>
Проверка выполнения домашнего задания.
Чек-лист обязательных пунктов:
1. Выполнен импорт требуемых данных/библиотек.
2. Реализован алгоритм обработки согласно условиям задачи.
3. Отсутствуют ошибки выполнения и логические расхождения.
4. Выведен корректный ответ.

Правила выставления оценки:
- Все пункты выполнены -> 10 баллов.
- Есть нарушение хотя бы одного из пунктов -> 2 балла.
- Пустое решение -> 0 баллов.
</goal>`
    },
    {
      id: 'template_text',
      name: '3. Оценка теоретического ответа',
      description: 'Шаблон для проверки текстовых развернутых ответов и эссе',
      content: `<goal>
Проверка теоретического ответа по теме [Тема].
Требования к ответу студента:
- Дано четкое определение ключевым терминам и понятиям.
- Приведены конкретные прикладные примеры.
- Ответ структурирован, без орфографических и фактологических ошибок.

Шкала баллов:
- 10 баллов: Полный, глубокий и верный ответ.
- 5-8 баллов: Незначительные недочеты при сохранении правильной сути.
- 2 балла: Грубые ошибки, поверхностный ответ или ложные факты.
- 0 баллов: Ответ отсутствует.
</goal>`
    }
  ];

  const [customPromptTemplates, setCustomPromptTemplates] = useState<Array<{
    id: string;
    name: string;
    description: string;
    content: string;
  }>>(() => {
    const saved = localStorage.getItem('neurochecker_v3_user_templates');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Failed to parse user templates', e);
      }
    }
    return [];
  });

  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');

  const allPromptTemplates = [...defaultPromptTemplates, ...customPromptTemplates];

  useEffect(() => {
    localStorage.setItem('neurochecker_v3_user_templates', JSON.stringify(customPromptTemplates));
  }, [customPromptTemplates]);

  useEffect(() => {
    const selected = allPromptTemplates.find(t => t.id === selectedTemplateId);
    if (selected) {
      setCustomTemplateInput(selected.content);
    }
  }, [selectedTemplateId]);

  const handleCompressPrompt = async () => {
    if (!rawHomeworkInput.trim()) {
      alert('Пожалуйста, введите или вставьте исходный текст домашнего задания.');
      return;
    }

    setIsCompressing(true);
    setCompressResult(null);

    try {
      let userSecretsHeader = '';
      if (secrets && Object.keys(secrets).length > 0) {
        const formatted = Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n');
        userSecretsHeader = btoa(unescape(encodeURIComponent(formatted)));
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (userSecretsHeader) {
        headers['x-user-secrets'] = userSecretsHeader;
      }

      const res = await fetch('/api/compress-prompt', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          raw_text: rawHomeworkInput,
          topic: tema,
          template_example: customTemplateInput,
          model
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Ошибка при сокращении промпта');
      }

      setCompressResult(data);
    } catch (err: any) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSaveCustomTemplate = () => {
    if (!newTemplateName.trim()) {
      alert('Пожалуйста, введите название шаблона.');
      return;
    }
    const newT = {
      id: 'custom_' + Date.now(),
      name: newTemplateName.trim(),
      description: newTemplateDesc.trim() || 'Пользовательский шаблон промпта',
      content: customTemplateInput
    };
    setCustomPromptTemplates(prev => [...prev, newT]);
    setSelectedTemplateId(newT.id);
    setIsSavingTemplate(false);
    setNewTemplateName('');
    setNewTemplateDesc('');
  };

  const handleDeleteCustomTemplate = (id: string) => {
    setCustomPromptTemplates(prev => prev.filter(t => t.id !== id));
    if (selectedTemplateId === id) {
      setSelectedTemplateId('template_goal');
    }
  };

  const [checkingLogs, setCheckingLogs] = useState<{ id: string; text: string; type: 'info' | 'success' | 'warning' | 'error' | 'pending'; timestamp: string }[]>([]);
  const logsEndRef = React.useRef<HTMLDivElement | null>(null);

  const addCheckingLog = (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'pending' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    setCheckingLogs(prev => [...prev, { id: Math.random().toString(36).substring(2, 11), text, type, timestamp }]);
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [checkingLogs]);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('neurochecker_v3_config', JSON.stringify({
      zadaniya,
      additionalColabs,
      tema,
      etalonLink,
      secrets,
      numCorrect,
      numIncorrect,
      model,
      forceSelectedTypes,
      selectedTypes,
      taskType,
      etalonText
    }));
  }, [zadaniya, additionalColabs, tema, etalonLink, secrets, numCorrect, numIncorrect, model, forceSelectedTypes, selectedTypes, taskType, etalonText]);

  useEffect(() => {
    if (!activeRunId) return;
    setRunsHistory(prev => {
      const existing = prev.find(r => r.id === activeRunId);
      if (!existing) return prev;
      
      const updatedRun: SavedRun = {
        ...existing,
        testCases,
        results,
        checkingLogs,
        totalCost,
        // Also save current inputs in case they are updated/run again
        taskType,
        etalonLink,
        etalonText,
        tema,
        zadaniya: [...zadaniya],
        numCorrect,
        numIncorrect,
        model,
        forceSelectedTypes,
        selectedTypes: [...selectedTypes],
        additionalColabs: additionalColabs.map(c => ({ ...c }))
      };
      
      const nextHistory = prev.map(r => r.id === activeRunId ? updatedRun : r);
      localStorage.setItem('neurochecker_v3_runs_history', JSON.stringify(nextHistory));
      return nextHistory;
    });
  }, [activeRunId, testCases, results, checkingLogs, totalCost]);

  useEffect(() => {
    fetch('/api/log-launch', { method: 'POST' }).catch(console.error);
  }, []);

  const fetchLogs = async () => {
    try {
      const resp = await fetch('/api/logs');
      const data = await resp.json();
      setUsageLogs(data);
    } catch (e) {
      console.error('Failed to fetch logs', e);
    }
  };

  const fetchPrompts = async () => {
    try {
      const resp = await fetch('/api/prompts');
      const data = await resp.json();
      setPrompts(data);
    } catch (e) {
      console.error('Failed to fetch prompts', e);
    }
  };

  useEffect(() => {
    if (viewMode === 'prompts') {
      fetchPrompts();
    }
    if (viewMode === 'logs') {
      fetchLogs();
    }
  }, [viewMode]);

  const calculateMetrics = (data: TestResult[]) => {
    const valid = data.filter(r => r.actual_grade !== undefined);
    if (valid.length < 1) return null;

    const expected = valid.map(r => r.expected_grade);
    const actual = valid.map(r => r.actual_grade!);

    // MAE
    const mae = expected.reduce((acc, val, i) => acc + Math.abs(val - actual[i]), 0) / valid.length;

    // Accuracy (exact match)
    const exactMatches = expected.filter((val, i) => val === actual[i]).length;
    const accuracy = exactMatches / valid.length;

    // Pearson Correlation
    const meanExp = expected.reduce((a, b) => a + b, 0) / expected.length;
    const meanAct = actual.reduce((a, b) => a + b, 0) / actual.length;
    const num = expected.reduce((acc, val, i) => acc + (val - meanExp) * (actual[i] - meanAct), 0);
    const den = Math.sqrt(
      expected.reduce((acc, val) => acc + Math.pow(val - meanExp, 2), 0) *
      actual.reduce((acc, val) => acc + Math.pow(val - meanAct, 2), 0)
    );
    const correlation = den === 0 ? 0 : num / den;

    return { correlation, mae, accuracy };
  };

  const calculateCost = (usage: any, modelName: string) => {
    const usdPrice = 75; // Rubles per USD
    const rates: Record<string, { in: number, out: number }> = {
      'gpt-4o': { in: 5.0, out: 15.0 },
      'gpt-4o-mini': { in: 0.15, out: 0.6 },
      'gpt-4.1': { in: 5.5, out: 16.5 }
    };
    const rate = rates[modelName] || rates['gpt-4o'];
    const costUsd = (usage.prompt_tokens * rate.in + usage.completion_tokens * rate.out) / 1_000_000;
    return costUsd * usdPrice;
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
    script.onload = async () => {
      // @ts-ignore
      const py = await loadPyodide();
      setPyodide(py);
      // Create standard directories often used in Colab
      py.FS.mkdirTree('/content');
      py.FS.chdir('/content');
    };
    document.body.appendChild(script);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !pyodide) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = new Uint8Array(reader.result as ArrayBuffer);
        const path = `/content/${file.name}`;
        pyodide.FS.writeFile(path, content);
        setUploadedFiles(prev => [...new Set([...prev, path])]);
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const runCode = async (code: string) => {
    if (!pyodide) {
      setExecutionOutput('Python engine loading...');
      return;
    }
    
    try {
      setExecutionOutput('Initializing environment...');
      
      // Load common packages if they are imported in the code
      const packagesToLoad = [];
      if (code.includes('import sqlite3')) packagesToLoad.push('sqlite3');
      if (code.includes('import pandas')) packagesToLoad.push('pandas');
      if (code.includes('import numpy')) packagesToLoad.push('numpy');
      
      if (packagesToLoad.length > 0) {
        setExecutionOutput(`Loading packages: ${packagesToLoad.join(', ')}...`);
        await pyodide.loadPackage(packagesToLoad);
      }

      setExecutionOutput('Executing...');
      await pyodide.runPythonAsync(`
import sys
import io
sys.stdout = io.StringIO()
      `);
      // Clean code from potential metadata lines, markdown blocks, and markers
      const cleanCode = code.split('\n')
        .filter(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('Executed at:')) return false;
          if (trimmed.startsWith('File "<exec>"')) return false;
          if (trimmed.startsWith('===')) return false;
          if (trimmed.startsWith('---')) return false;
          if (trimmed.startsWith('```')) return false;
          if (trimmed.startsWith('#!')) return false; // Shebang
          if (trimmed.startsWith('# Содержимое файла')) return false;
          if (trimmed.startsWith('Cell type:')) return false;
          if (trimmed.startsWith('Source:')) return false;
          return true;
        })
        .join('\n');

      await pyodide.runPythonAsync(cleanCode);
      const output = await pyodide.runPythonAsync('sys.stdout.getvalue()');
      setExecutionOutput(output || '>> Execution completed with no output');
    } catch (err: any) {
      setExecutionOutput(`Traceback (most recent call last):\n  File "solution.py", line undefined\nError: ${err.message}`);
    }
  };

  const formatFullFeedback = (res: TestResult) => {
    if (!res.full_feedback) return res.comment || '—';
    
    const f = res.full_feedback;
    let text = `Добрый день, Студент!\n\n`;
    text += `Оценил Вашу работу над домашним заданием по теме "${f.topic || tema}"! Давайте рассмотрим его более детально:\n\n`;
    
    if (f.homework_tasks && Array.isArray(f.homework_tasks)) {
      f.homework_tasks.forEach((task: any) => {
        text += `Задание ${task.task_number}:\n`;
        text += `Описание: ${task.task_description}\n`;
        text += `Оценка: ${task.score}/10\n`;
        text += `Комментарий: ${task.comment}\n\n`;
      });
    }
    
    text += `Общая оценка задания:\n`;
    text += `Оценка: ${res.actual_grade}/10\n`;
    text += `Общий комментарий: ${f.overall_comment || res.comment}\n\n`;
    
    if (f.additional_recommendations) {
      text += `Дополнительные рекомендации:\n${f.additional_recommendations}\n\n`;
    }
    
    text += `С уважением,\nКиберкуратор`;
    return text;
  };

  const exportToExcel = () => {
    const data: any[] = [];
    
    zadaniya.forEach((zad, zIdx) => {
      const taskResults = Array.isArray(results[zIdx]) ? results[zIdx] : [];
      taskResults.forEach((res) => {
        data.push({
          'Тема (Topic)': tema,
          ' ': '',
          '  ': '',
          '   ': '',
          'Решение (Change Summary)': res.change_summary || '—',
          'Ожид. оценка (Plan)': res.expected_grade,
          'Факт. оценка (Fact)': res.actual_grade ?? '—',
          'Ответ GPT (AI Feedback)': formatFullFeedback(res)
        });
      });
    });

    if (data.length === 0) {
      alert('No data to export. Run batch check first.');
      return;
    }

    // Add spacing row and Task Definitions at the bottom
    data.push({}); 
    data.push({ 'Тема (Topic)': 'ОБЩИЙ TASK DEFINITION:' });
    zadaniya.forEach((zad, idx) => {
      data.push({ 'Тема (Topic)': `${zadaniya.length > 1 ? (idx + 1) + '. ' : ''}${zad}` });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HW_Verification_Log');
    XLSX.writeFile(wb, `neuro_checker_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  };

  const handleOptimizePrompt = async () => {
    setIsOptimizing(true);
    setOptStopRequested(false);
    optStopRequestedRef.current = false;
    setOptStage('initializing');
    setOptIteration(0);
    setOptHistory([]);
    setOptimizationResult(null);
    setOptLogs(["[INIT] Подготовка к автоматической оптимизации промпта..."]);
    setViewMode('optimization');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    try {
      setOptStage('generating_cases');
      setOptLogs(prev => [...prev, "📡 Шаг 1: Подготовка и загрузка учебных кейсов..."]);
      
      let currentCases = testCases;

      // If testCases is empty or user requested force regeneration, generate test cases using current sidebar params
      if (!currentCases || currentCases.length === 0 || forceOptRegenerate) {
        setOptLogs(prev => [
          ...prev, 
          `📡 Запуск генерации кейсов из настроек меню: Pass cases (${numCorrect || 0}), Fail cases (${numIncorrect || 0}), типы: ${selectedTypes.length > 0 ? selectedTypes.join(', ') : 'все доступные'}...`
        ]);

        const genResp = await fetch('/api/generate-cases', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-secrets': btoa(unescape(encodeURIComponent(Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n'))))
          },
          body: JSON.stringify({ 
            etalon_link: etalonLink, 
            etalon_text: etalonText,
            task_type: taskType,
            tema, 
            zadanie: zadaniya[0], 
            num_correct: numCorrect || 0, 
            num_incorrect: numIncorrect || 0, 
            enabled_types: selectedTypes,
            force_selected_types: forceSelectedTypes,
            model,
            additional_colabs: additionalColabs
          }),
          signal
        });

        if (!genResp.ok) {
          throw new Error("Не удалось загрузить или сгенерировать тест-кейсы для оптимизации. Убедитесь, что эталон и тема заполнены.");
        }

        const genData = await genResp.json();
        currentCases = genData.results || [];
        setTestCases(currentCases);
        setOptLogs(prev => [...prev, `✔ Успешно сгенерировано и загружено ${currentCases.length} учебных кейсов (${numCorrect || 0} Pass, ${numIncorrect || 0} Fail).`]);
      } else {
        setOptLogs(prev => [...prev, `✔ Использование существующего набора из ${currentCases.length} тест-кейсов.`]);
      }

      setOptLogs(prev => [...prev, "🤖 Шаг 2: Запуск пошагового циклического улучшения (GPT 5.4 Judge)..."]);
      
      let currentZadanie = zadaniya[0];
      let iter = 1;
      const historyAcc: any[] = [];
      let totalTokens = 0;
      let finishedSuccessfully = false;

      while (iter <= 20) {
        if (optStopRequestedRef.current) {
          setOptLogs(prev => [...prev, "🛑 [ОСТАНОВКА] Оптимизация прервана пользователем."]);
          break;
        }

        setOptIteration(iter);
        setOptStage('evaluating_and_tuning');
        setOptLogs(prev => [...prev, `\n🔄 [ЦИКЛ #${iter}] Отверка промпта и донастройка...`]);

        const optResp = await fetch('/api/optimize-step', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-secrets': btoa(unescape(encodeURIComponent(Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n'))))
          },
          body: JSON.stringify({
            tema,
            zadanie: currentZadanie,
            testCases: currentCases.map(tc => ({
              type: tc.type,
              student_code: tc.student_code || "",
              expected_grade: tc.expected_grade
            })),
            model,
            task_type: taskType
          }),
          signal
        });

        if (!optResp.ok) {
          const errorData = await optResp.json().catch(() => ({}));
          throw new Error(errorData.error || "Ошибка во время промпт-оптимизации.");
        }

        const stepData = await optResp.json();
        totalTokens += stepData.total_tokens_used || 0;

        // Apply corrected expected grades to our testCases array for the next iterations
        if (stepData.results) {
          stepData.results.forEach((r: any) => {
            if (r.isCuratorError && r.correctedExpectedGrade !== undefined) {
              const tc = currentCases[r.caseIndex];
              if (tc && tc.expected_grade !== r.correctedExpectedGrade) {
                setOptLogs(prev => [
                  ...prev,
                  `💡 [СКОРРЕКТИРОВАНО] Ожидаемая оценка кейса #${r.caseIndex + 1} изменена с ${tc.expected_grade} на ${r.correctedExpectedGrade} (Ошибка куратора).`
                ]);
                tc.expected_grade = r.correctedExpectedGrade;
              }
            }
          });
          // Sync back to React state so the UI reflects the updated expected grades
          setTestCases([...currentCases]);
        }

        // Calculate progress metrics
        const totalCount = stepData.results.length;
        const mismatchesCount = stepData.mismatches.length;
        const accuracy = totalCount > 0 ? Math.round(((totalCount - mismatchesCount) / totalCount) * 100) : 0;
        const mae = totalCount > 0 
          ? (stepData.results.reduce((sum: number, r: any) => sum + Math.abs(r.actual_grade - r.expected_grade), 0) / totalCount).toFixed(2)
          : "0.00";

        const stepRecord = {
          iteration: iter,
          results: stepData.results,
          mismatches: stepData.mismatches,
          analysis: stepData.analysis,
          optimized_prompt: stepData.optimized_prompt,
          accuracy,
          mae,
          cost_rub: stepData.cost_rub || 0,
          curator_errors_count: stepData.curator_errors_count || 0
        };

        historyAcc.push(stepRecord);
        // We set both state and a temporary holder to display progress
        setOptHistory([...historyAcc]);
        
        // Update the Task Definition in inputs immediately (keeping the last found/improved case!)
        if (stepData.optimized_prompt) {
          currentZadanie = stepData.optimized_prompt;
          setZadaniya(prev => {
            const updated = [...prev];
            updated[0] = stepData.optimized_prompt;
            return updated;
          });
        }

        // Output detailed log feedback
        setOptLogs(prev => [
          ...prev,
          `✔ Итерация #${iter} завершена.`,
          `💸 Стоимость итерации: ${(stepData.cost_rub || 0).toFixed(2)} ₽`,
          `📊 Точность: ${accuracy}% | MAE (средняя ошибка): ${mae} баллов.`,
          stepData.curator_errors_count > 0 ? `⚠️ Найдено ошибок в ожидаемых оценках куратора: ${stepData.curator_errors_count}` : null,
          `🎯 Активных расхождений: ${mismatchesCount} из ${totalCount}.`,
          `🧠 Анализ GPT 5.4 Judge: "${stepData.analysis.substring(0, 160)}..."`
        ].filter(Boolean) as string[]);

        if (stepData.isFullySuccessful) {
          finishedSuccessfully = true;
          setOptLogs(prev => [
            ...prev,
            `✨ [УСПЕХ] Идеальное совпадение оценок достигнуто на итерации #${iter}!`,
            `🎉 Оценщик полностью синхронизировался с куратором!`
          ]);
          break;
        }

        // Wait a brief moment to allow the UI to refresh nicely and show progress
        await new Promise(resolve => setTimeout(resolve, 1000));
        iter++;
      }

      setOptStage('finished');
      setOptimizationResult({
        success: true,
        isFullySuccessful: finishedSuccessfully,
        history: historyAcc,
        total_tokens_used: totalTokens,
        final_prompt: currentZadanie
      });

      setIsOptResultModalOpen(true);
      fetchPrompts();

    } catch (err: any) {
      if (err.name === 'AbortError' || optStopRequestedRef.current) {
        setOptLogs(prev => [...prev, "🛑 [ОСТАНОВКА] Процесс был остановлен пользователем."]);
      } else {
        console.error(err);
        setOptLogs(prev => [...prev, `❌ [ОШИБКА] Оптимизация прервана: ${err.message}`]);
      }
      setOptStage('finished');
    } finally {
      setIsOptimizing(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopOptimization = () => {
    setOptStopRequested(true);
    optStopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setOptLogs(prev => [...prev, "⏳ Отправлен запрос на остановку. Завершаем текущую операцию..."]);
  };

  const loadPastRunState = (run: SavedRun) => {
    setTaskType(run.taskType);
    setEtalonLink(run.etalonLink);
    setEtalonText(run.etalonText);
    setTema(run.tema);
    setZadaniya(Array.isArray(run.zadaniya) ? [...run.zadaniya] : []);
    setNumCorrect(run.numCorrect);
    setNumIncorrect(run.numIncorrect);
    setModel(run.model);
    setForceSelectedTypes(run.forceSelectedTypes);
    setSelectedTypes(Array.isArray(run.selectedTypes) ? [...run.selectedTypes] : []);
    setAdditionalColabs(Array.isArray(run.additionalColabs) ? run.additionalColabs.map(c => ({ ...c })) : []);
    
    setTestCases(run.testCases || []);
    setResults(run.results || {});
    setCheckingLogs(run.checkingLogs || []);
    setTotalCost(run.totalCost || 0);
  };

  const handleStart = async (overrideParams?: any) => {
    const isOverride = !!(overrideParams && typeof overrideParams === 'object' && 'id' in overrideParams);
    const p_taskType = isOverride ? overrideParams.taskType : taskType;
    const p_etalonLink = isOverride ? overrideParams.etalonLink : etalonLink;
    const p_etalonText = isOverride ? overrideParams.etalonText : etalonText;
    const p_tema = isOverride ? overrideParams.tema : tema;
    const rawZadaniya = isOverride ? overrideParams.zadaniya : zadaniya;
    const p_zadaniya = Array.isArray(rawZadaniya) ? rawZadaniya : [];
    const p_numCorrect = isOverride ? overrideParams.numCorrect : numCorrect;
    const p_numIncorrect = isOverride ? overrideParams.numIncorrect : numIncorrect;
    const p_model = isOverride ? overrideParams.model : model;
    const p_forceSelectedTypes = isOverride ? overrideParams.forceSelectedTypes : forceSelectedTypes;
    const rawSelectedTypes = isOverride ? overrideParams.selectedTypes : selectedTypes;
    const p_selectedTypes = Array.isArray(rawSelectedTypes) ? rawSelectedTypes : [];
    const rawAdditionalColabs = isOverride ? overrideParams.additionalColabs : additionalColabs;
    const p_additionalColabs = Array.isArray(rawAdditionalColabs) ? rawAdditionalColabs : [];

    setLoading(true);
    setTestCases([]);
    setResults({});
    setTotalCost(0);
    setActiveTaskIdx(0); // Reset to first task on start to avoid out-of-bounds index
    setCheckingLogs([]); // Reset previous logs
    
    const runId = Math.random().toString(36).substring(2, 11);
    setActiveRunId(runId);
    
    // Create new saved run in history
    const newRun: SavedRun = {
      id: runId,
      timestamp: new Date().toISOString(),
      taskType: p_taskType,
      etalonLink: p_etalonLink,
      etalonText: p_etalonText,
      tema: p_tema,
      zadaniya: [...p_zadaniya],
      numCorrect: p_numCorrect,
      numIncorrect: p_numIncorrect,
      model: p_model,
      forceSelectedTypes: p_forceSelectedTypes,
      selectedTypes: [...p_selectedTypes],
      additionalColabs: p_additionalColabs.map((c: any) => ({ ...c })),
      testCases: [],
      results: {},
      checkingLogs: [],
      totalCost: 0
    };
    
    setRunsHistory(prev => {
      const updated = [newRun, ...prev].slice(0, 50);
      localStorage.setItem('neurochecker_v3_runs_history', JSON.stringify(updated));
      return updated;
    });

    addCheckingLog('🚀 Запуск последовательности проверки домашних заданий...', 'info');
    addCheckingLog(`Выбранная модель: ${p_model}`, 'info');
    addCheckingLog(`Формат задания: ${p_taskType.toUpperCase()}`, 'info');
    addCheckingLog(`Количество проверяемых заданий (промптов): ${p_zadaniya.length}`, 'info');

    let runningCost = 0;
    let totalTokens = 0;
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    try {
      addCheckingLog('📡 [Шаг 1 из 3] Генерация учебных кейсов (student submissions)...', 'pending');
      if (p_taskType === 'code' && p_etalonLink) {
        addCheckingLog(`Ссылка на эталонный ноутбук: ${p_etalonLink}`, 'info');
      } else if (p_taskType === 'text' && p_etalonLink) {
        addCheckingLog(`Ссылка на эталонный текстовый ответ: ${p_etalonLink}`, 'info');
      }

      const genResp = await fetch('/api/generate-cases', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-secrets': btoa(unescape(encodeURIComponent(Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n'))))
        },
        body: JSON.stringify({ 
          etalon_link: p_etalonLink, 
          etalon_text: p_etalonText,
          task_type: p_taskType,
          tema: p_tema, 
          zadanie: p_zadaniya[0], 
          num_correct: p_numCorrect || 0, 
          num_incorrect: p_numIncorrect || 0, 
          enabled_types: p_selectedTypes,
          force_selected_types: p_forceSelectedTypes,
          model: p_model,
          additional_colabs: p_additionalColabs
        }),
        signal
      });
      
      if (!genResp.ok) {
        let errMsg = 'Неизвестная ошибка на сервере при генерации кейсов';
        try {
          const errorData = await genResp.json();
          errMsg = errorData.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const genData = await genResp.json();
      
      if (genData.usage) {
        totalTokens += genData.usage.total_tokens || 0;
        const cost = calculateCost(genData.usage, p_model);
        runningCost += cost;
        setTotalCost(runningCost);
        addCheckingLog(`Потребление токенов при генерации: +${genData.usage.total_tokens} токенов (~${cost.toFixed(4)} ₽)`, 'info');
      }

      const generatedCases: TestResult[] = genData.results || [];
      if (generatedCases.length === 0) {
        throw new Error('Сервер не вернул сгенерированные тест-кейсы');
      }
      
      setTestCases(generatedCases);
      addCheckingLog(`✔ [Шаг 1 из 3] Успешно сгенерировано ${generatedCases.length} кейсов студентов.`, 'success');
      generatedCases.forEach((c, idx) => {
        addCheckingLog(`   • Кейс #${idx + 1}: [Тип: ${c.type}] Ожидаемая оценка: ${c.expected_grade}`, 'info');
      });

      // Step 2: For each Zadanie, run evaluation
      addCheckingLog('🔍 [Шаг 2 из 3] Оценка студенческих кейсов нейросетью...', 'pending');
      for (let zIdx = 0; zIdx < p_zadaniya.length; zIdx++) {
        if (signal.aborted) {
          addCheckingLog('⚠ Процесс проверки прерван пользователем.', 'warning');
          break;
        }
        const currentZadanie = p_zadaniya[zIdx];
        addCheckingLog(`📝 Оценка Задания #${zIdx + 1}: "${currentZadanie.slice(0, 60)}..."`, 'pending');
        
        // Initialize results for this task
        setResults(prev => ({ ...prev, [zIdx]: [...generatedCases] }));

        for (let i = 0; i < generatedCases.length; i++) {
          if (signal.aborted) {
            addCheckingLog('⚠ Процесс проверки прерван пользователем.', 'warning');
            break;
          }

          const currentCase = generatedCases[i];
          addCheckingLog(`   ⚡ Проверка Кейса #${i + 1}/${generatedCases.length} (Тип: ${currentCase.type})...`, 'pending');

          try {
            const checkResp = await fetch('/api/check-homework', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-user-secrets': btoa(unescape(encodeURIComponent(Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n'))))
              },
              body: JSON.stringify({ tema: p_tema, zadanie: currentZadanie, resheniye: currentCase.student_code || "", model: p_model, task_type: p_taskType }),
              signal
            });

            if (!checkResp.ok) {
              let errMsg = 'Ошибка при вызове /api/check-homework';
              try {
                const checkErrData = await checkResp.json();
                errMsg = checkErrData.error || errMsg;
              } catch (_) {}
              throw new Error(errMsg);
            }

            const checkData = await checkResp.json();
            
            if (checkData.usage) {
              totalTokens += checkData.usage.total_tokens || 0;
              const cost = calculateCost(checkData.usage, p_model);
              runningCost += cost;
              setTotalCost(runningCost);
            }

            addCheckingLog(`   ✔ Кейс #${i + 1} проверен! Оценка нейросети: ${checkData.overall_score}/10 (Ожидалось: ${currentCase.expected_grade})`, 'success');

            setResults(prev => {
              const updatedForTask = [...(prev[zIdx] || [])];
              if (updatedForTask[i]) {
                updatedForTask[i] = { 
                  ...updatedForTask[i], 
                  actual_grade: checkData.overall_score, 
                  comment: checkData.overall_comment,
                  full_feedback: checkData
                };
              }
              return { ...prev, [zIdx]: updatedForTask };
            });

          } catch (checkErr: any) {
            console.error(`Check failed for test case ${i}`, checkErr);
            addCheckingLog(`   ❌ ОШИБКА при проверке Кейса #${i + 1}: ${checkErr.message}`, 'error');
            if (checkErr.message.includes('API key') || checkErr.message.includes('Unauthorized') || checkErr.message.includes('key')) {
              addCheckingLog(`      💡 Рекомендация: Проверьте 'Private Secrets' в боковой панели. Убедитесь, что добавлен валидный OPENAI_API_KEY.`, 'warning');
            }
          }
        }
      }
      
      if (!signal.aborted) {
        addCheckingLog('💾 [Шаг 3 из 3] Сохранение результатов сессии в глобальный лог аудита...', 'pending');
        // Log the full session
        await fetch('/api/log-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            tokens: totalTokens, 
            action: `Full Check: ${p_tema} (${p_zadaniya.length} prompts, ${generatedCases.length} cases)` 
          })
        }).catch(console.error);

        addCheckingLog('✨ Проверка домашних заданий успешно завершена!', 'success');
        addCheckingLog(`📊 Итоговая стоимость: ${runningCost.toFixed(4)} ₽ (использовано токенов: ${totalTokens.toLocaleString()})`, 'info');
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        addCheckingLog('⚠ Процесс проверки был остановлен пользователем.', 'warning');
      } else {
        console.error(error);
        addCheckingLog(`❌ КРИТИЧЕСКАЯ ОШИБКА ПРОЦЕССА: ${error.message}`, 'error');
        if (error.message.includes('API key') || error.message.includes('ApiKey') || error.message.includes('Unauthorized') || error.message.includes('key')) {
          addCheckingLog(`   💡 Решение: Эта ошибка обычно возникает из-за отсутствующего или неверного OpenAI API ключа. Пожалуйста, добавьте секрет с именем 'OPENAI_API_KEY' в секции 'Private Secrets' боковой панели.`, 'warning');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          addCheckingLog(`   💡 Решение: Проблема сетевого подключения или превышение лимитов запросов (Rate limits) OpenAI. Попробуйте уменьшить количество тест-кейсов.`, 'warning');
        } else {
          addCheckingLog(`   💡 Решение: Пожалуйста, проверьте серверные логи или корректность выбранной языковой модели.`, 'warning');
        }
        alert(`Процесс завершился ошибкой: ${error.message}`);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      {/* Left Sidebar: Configuration */}
      <aside className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/40 shrink-0">
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
            <h1 className="font-semibold text-zinc-100 uppercase tracking-widest text-[10px]">Neuro-Checker v2.0</h1>
          </div>
          <p className="text-[10px] text-zinc-500">AI-Assisted Homework Validation</p>
        </div>
        
        <div className="flex-1 p-6 space-y-6 overflow-y-auto overflow-x-hidden">
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Task Format</label>
            <div className="grid grid-cols-2 p-0.5 bg-zinc-950 rounded-lg border border-zinc-800">
              <button
                onClick={() => setTaskType('code')}
                className={`py-1.5 text-[10px] font-bold uppercase rounded transition-all ${
                  taskType === 'code'
                    ? 'bg-zinc-800 text-indigo-400 border border-zinc-700/50 shadow-lg'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Code (Python)
              </button>
              <button
                onClick={() => setTaskType('text')}
                className={`py-1.5 text-[10px] font-bold uppercase rounded transition-all ${
                  taskType === 'text'
                    ? 'bg-zinc-800 text-indigo-400 border border-zinc-700/50 shadow-lg'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Theory / Text
              </button>
            </div>
          </div>

          {taskType === 'code' ? (
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Reference Notebook</label>
              <input 
                type="text" 
                value={etalonLink}
                onChange={e => setEtalonLink(e.target.value)}
                placeholder="https://colab.research.google.com/..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs text-zinc-400 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Reference Text Link</label>
              <input 
                type="text" 
                value={etalonLink}
                onChange={e => setEtalonLink(e.target.value)}
                placeholder="https://colab.research.google.com/..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs text-zinc-400 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
              />
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Topic</label>
            <input 
              type="text" 
              value={tema}
              onChange={e => setTema(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Task Definitions (Prompts)</label>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => {
                    if (!rawHomeworkInput && zadaniya.length > 0 && zadaniya[0]) {
                      setRawHomeworkInput(zadaniya[0]);
                    }
                    setIsCompressModalOpen(true);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded text-[9px] font-bold uppercase transition-all"
                  title="Сократить развернутое ДЗ в краткий промпт с использованием шаблонов"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Сократить ДЗ</span>
                </button>
                <button 
                  onClick={() => setZadaniya([...zadaniya, ''])}
                  className="p-1 hover:bg-zinc-800 rounded transition-colors text-indigo-400"
                  title="Добавить еще один промпт"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {zadaniya.map((zad, idx) => (
                <div key={idx} className="relative group space-y-1">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[9px] font-mono text-zinc-500 font-bold">Промпт #{idx + 1}</span>
                    <button
                      onClick={() => {
                        setRawHomeworkInput(zad);
                        setIsCompressModalOpen(true);
                      }}
                      className="text-[9px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Сократить этот текст задания"
                    >
                      <Scissors className="w-2.5 h-2.5" /> Сократить
                    </button>
                  </div>
                  <textarea 
                    value={zad}
                    onChange={e => {
                      const updated = [...zadaniya];
                      updated[idx] = e.target.value;
                      setZadaniya(updated);
                    }}
                    placeholder={`Task Definition #${idx + 1}`}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-[10px] focus:outline-none focus:border-zinc-500 transition-colors h-24 resize-none font-mono"
                  />
                  {zadaniya.length > 1 && (
                    <button 
                      onClick={() => setZadaniya(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -right-2 -top-2 p-1 bg-rose-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Pass Cases</label>
              <input 
                type="number" 
                min="0"
                value={numCorrect}
                onChange={e => setNumCorrect(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value)))}
                placeholder="0"
                className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Fail Cases</label>
              <input 
                type="number" 
                min="0"
                value={numIncorrect}
                onChange={e => setNumIncorrect(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value)))}
                placeholder="0"
                className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Model</label>
            <select 
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs appearance-none focus:outline-none focus:border-zinc-500"
            >
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4.1">GPT-4.1 (Custom)</option>
            </select>
          </div>

          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                {taskType === 'code' ? 'Additional Notebooks' : 'Additional Answers'}
              </label>
              <button 
                onClick={() => setAdditionalColabs([...additionalColabs, { link: '', name: '', expected_grade: 10 }])}
                className="p-1 hover:bg-zinc-800 rounded transition-colors text-indigo-400"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3">
              {additionalColabs.map((colab, idx) => (
                <div key={idx} className="p-3 bg-zinc-950/50 border border-zinc-800 rounded-lg space-y-2 relative group">
                  <button 
                    onClick={() => setAdditionalColabs(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -right-2 -top-2 p-1 bg-rose-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <input 
                    type="text" 
                    placeholder={taskType === 'code' ? "Notebook Name" : "Answer Label/Title"}
                    value={colab.name}
                    onChange={e => {
                      const updated = [...additionalColabs];
                      updated[idx].name = e.target.value;
                      setAdditionalColabs(updated);
                    }}
                    className="w-full bg-transparent border-b border-zinc-800 text-[10px] focus:outline-none py-1"
                  />
                  <input 
                    type="text" 
                    placeholder={taskType === 'code' ? "https://colab.research..." : "Reference Answer text or Link..."}
                    value={colab.link}
                    onChange={e => {
                      const updated = [...additionalColabs];
                      updated[idx].link = e.target.value;
                      setAdditionalColabs(updated);
                    }}
                    className="w-full bg-transparent border-b border-zinc-800 text-[10px] focus:outline-none py-1 font-mono"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] text-zinc-600 uppercase font-black">Expected Grade</span>
                    <input 
                      type="number" 
                      value={colab.expected_grade}
                      onChange={e => {
                        const updated = [...additionalColabs];
                        updated[idx].expected_grade = parseInt(e.target.value);
                        setAdditionalColabs(updated);
                      }}
                      className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1 text-[10px] focus:outline-none text-center"
                    />
                  </div>
                </div>
              ))}
              {additionalColabs.length === 0 && (
                <p className="text-[10px] text-zinc-600 text-center py-2 italic border border-zinc-800 border-dashed rounded">
                  {taskType === 'code' ? 'No additional test notebooks' : 'No additional test answers'}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Include Types</label>
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox"
                    checked={forceSelectedTypes}
                    onChange={(e) => setForceSelectedTypes(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-zinc-800 rounded-full peer peer-checked:bg-indigo-600 transition-colors"></div>
                  <div className="absolute left-0.5 w-3 h-3 bg-zinc-400 rounded-full transition-transform peer-checked:translate-x-3 peer-checked:bg-white"></div>
                </div>
                <span className="text-[9px] text-zinc-400 group-hover:text-zinc-300 transition-colors font-medium">ONLY SELECTED</span>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {caseTypes.map(ct => {
                const isSelected = selectedTypes.includes(ct.id);
                const isDisabled = !isSelected && selectedTypes.length >= (typeof numIncorrect === 'number' ? numIncorrect : 0);
                return (
                  <label 
                    key={ct.id} 
                    className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' 
                        : isDisabled 
                          ? 'border-zinc-900 text-zinc-700 cursor-not-allowed opacity-50'
                          : 'border-zinc-900 text-zinc-500 hover:border-zinc-800'
                    }`}
                  >
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedTypes(selectedTypes.filter(id => id !== ct.id));
                        } else if (!isDisabled) {
                          setSelectedTypes([...selectedTypes, ct.id]);
                        }
                      }}
                      className="hidden"
                    />
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-700'}`}>
                      {isSelected && <Plus className="w-2.5 h-2.5 text-white rotate-45" style={{ transform: 'rotate(0deg)' }} />}
                    </div>
                    <span className="text-[10px] font-medium">{ct.label}</span>
                  </label>
                );
              })}
            </div>
            {selectedTypes.length > 0 && selectedTypes.length < (typeof numIncorrect === 'number' ? numIncorrect : 0) && (
              <p className="text-[9px] text-zinc-600 italic">
                Will pick {(typeof numIncorrect === 'number' ? numIncorrect : 0) - selectedTypes.length} more randomly
              </p>
            )}
          </div>

          <div className="space-y-4 pt-6 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-indigo-400 tracking-widest bg-indigo-500/5 px-2 py-1 rounded">Private Secrets</label>
            </div>
            
            {/* List of current secrets */}
            <div className="space-y-2">
              {Object.entries(secrets).map(([key]) => (
                <div key={key} className="flex items-center gap-2 group/secret">
                  <div className="flex-1 bg-zinc-950 border border-zinc-900 rounded px-2 py-1.5 flex justify-between items-center text-[10px] font-mono">
                    <span className="text-zinc-500">{key}</span>
                    <span className="text-zinc-700">••••••••</span>
                  </div>
                  <button 
                    onClick={() => {
                      const upd = { ...secrets };
                      delete upd[key];
                      setSecrets(upd);
                    }}
                    className="p-1 hover:bg-rose-500/10 text-rose-500/40 hover:text-rose-500 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {Object.keys(secrets).length === 0 && (
                <p className="text-[9px] text-zinc-700 italic py-2 text-center border border-zinc-800 border-dashed rounded">No secrets added</p>
              )}
            </div>

            {/* Add new secret UI */}
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Key" 
                value={newSecretKey}
                onChange={e => setNewSecretKey(e.target.value)}
                className="w-1/3 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-indigo-500/30 font-mono transition-all"
              />
              <input 
                type="password" 
                placeholder="Value" 
                value={newSecretValue}
                onChange={e => setNewSecretValue(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-indigo-500/30 font-mono transition-all"
              />
              <button 
                onClick={() => {
                  if (newSecretKey.trim() && newSecretValue.trim()) {
                    setSecrets({ ...secrets, [newSecretKey.trim()]: newSecretValue.trim() });
                    setNewSecretKey('');
                    setNewSecretValue('');
                  }
                }}
                className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-start gap-2 bg-indigo-500/5 p-3 rounded-lg border border-indigo-500/10">
              <Settings className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
              <p className="text-[9px] text-zinc-500 italic leading-tight">
                Stored locally in your browser. Our server will prioritize these keys for AI inference. 
                <br/><span className="text-[8px] text-zinc-600">(Use OPENAI_API_KEY for model calls)</span>
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-zinc-800">
          {totalCost > 0 && (
            <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Estimated Cost</span>
              <span className="text-xs font-mono text-zinc-100">{totalCost.toFixed(4)} ₽</span>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              disabled={loading}
              onClick={() => handleStart()}
              className="bg-zinc-100 hover:bg-white text-zinc-950 font-bold py-3 rounded text-[10px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest active:scale-[0.98]"
            >
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              <span>{loading ? 'Running...' : 'Start'}</span>
            </button>
            
            <button 
              disabled={!loading}
              onClick={handleStop}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded text-[10px] transition-all flex items-center justify-center gap-2 disabled:opacity-20 uppercase tracking-widest active:scale-[0.98]"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Stop</span>
            </button>
          </div>

          <button 
            disabled={loading || isOptimizing}
            onClick={handleOptimizePrompt}
            className="w-full mt-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded text-[10px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest active:scale-[0.98] border border-indigo-400/20 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
          >
            {isOptimizing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            <span>{isOptimizing ? 'Optimizing...' : 'Auto-Optimize Prompt (GPT 5.4)'}</span>
          </button>
        </div>

        <div className="p-6 border-t border-zinc-800">
          <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-2">Internal Assets (Virtual FS)</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold cursor-pointer transition-colors border border-zinc-700 border-dashed">
              <span>Upload File to /content/</span>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
            </label>
            
            {uploadedFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[9px] font-mono text-zinc-500 bg-zinc-950 p-1 px-2 rounded">
                    <FileCode className="w-3 h-3 text-indigo-500" />
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content: Dashboard */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950 shrink-0">
          <div className="flex items-center gap-8">
            <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800">
               <button 
                onClick={() => setViewMode('code')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'code' ? 'bg-zinc-100 text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                 <Code2 className="w-3 h-3" />
                 Checking
               </button>
               <button 
                onClick={() => setViewMode('analytics')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'analytics' ? 'bg-zinc-100 text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                 <BarChartIcon className="w-3 h-3" />
                 Analytics
               </button>
               <button 
                onClick={() => setViewMode('logs')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'logs' ? 'bg-zinc-100 text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                 <Settings className="w-3 h-3" />
                 Logs
               </button>
               <button 
                onClick={() => setViewMode('prompts')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'prompts' ? 'bg-zinc-100 text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                 <FileCode className="w-3 h-3" />
                 Prompts
               </button>
               <button 
                onClick={() => setViewMode('optimization')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'optimization' ? 'bg-zinc-100 text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                 <Wand2 className="w-3 h-3 text-indigo-400" />
                 Self-Improvement
               </button>
               <button 
                onClick={() => setViewMode('history')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'history' ? 'bg-zinc-100 text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                 <History className="w-3 h-3" />
                 History
               </button>
            </div>
            
            <div className="h-8 w-px bg-zinc-800"></div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Prompt Comparison</span>
              <div className="flex gap-1 mt-1">
                {zadaniya.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setActiveTaskIdx(idx)}
                    className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border transition-all ${activeTaskIdx === idx ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-8 w-px bg-zinc-800"></div>
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Global Status</span>
              <span className={`text-sm font-mono ${loading ? 'text-indigo-400 animate-pulse' : 'text-zinc-100'}`}>
                {Object.values(results).length > 0 ? `${Object.values(results).reduce((acc: number, curr: any) => acc + (Array.isArray(curr) ? curr.filter(r => r.actual_grade !== undefined).length : 0), 0)} / ${(testCases?.length || 0) * (zadaniya?.length || 0)} OK` : 'IDLE'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-zinc-950 bg-zinc-800"></div>
              ))}
            </div>
            <span className="text-[10px] text-zinc-500 uppercase font-bold ml-2">Verification AI</span>
          </div>
        </header>

        <section className="flex-1 p-8 flex flex-col gap-8 overflow-hidden">
          {viewMode === 'code' ? (
            <div className="flex-1 flex flex-col gap-8 overflow-hidden">
              {/* Solutions Table */}
              <div className="flex-1 overflow-auto border border-zinc-800 rounded-lg bg-zinc-900/20 scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-400 font-mono shadow-sm">
                    <tr>
                      <th className="p-3 border-r border-b border-zinc-800 font-normal w-12 text-center italic">ID</th>
                      <th className="p-3 border-r border-b border-zinc-800 font-normal">Type</th>
                      <th className="p-3 border-r border-b border-zinc-800 font-normal">Change Summary</th>
                      <th className="p-3 border-r border-b border-zinc-800 font-normal text-center">Plan</th>
                      <th className="p-3 border-r border-b border-zinc-800 font-normal text-center">Fact</th>
                      <th className="p-3 border-b border-zinc-800 font-normal">AI Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!Array.isArray(results[activeTaskIdx]) || results[activeTaskIdx].length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-20 text-center text-zinc-600 italic">
                          {loading ? 'Initializing test cases...' : 'No data for this prompt. Run batch check to populate.'}
                        </td>
                      </tr>
                    ) : (
                      results[activeTaskIdx].map((res, i) => (
                        <tr 
                          key={i} 
                          className={`hover:bg-zinc-900/50 transition-colors border-b border-zinc-900/50 group cursor-pointer ${activeCode === res.student_code ? 'bg-zinc-800/40' : ''}`}
                        >
                          <td className="p-3 border-r border-zinc-800 text-center font-mono text-zinc-600" onClick={() => setActiveCode(res.student_code)}>{(i+1).toString().padStart(2, '0')}</td>
                          <td className="p-3 border-r border-zinc-800 font-medium text-zinc-200 uppercase text-[10px] tracking-tight" onClick={() => setActiveCode(res.student_code)}>{res.type}</td>
                          <td className="p-3 border-r border-zinc-800 text-[10px] text-zinc-400 italic max-w-xs truncate" onClick={() => setActiveSummary(res)}>
                            <div className="flex items-center justify-between gap-2 px-2 py-1 hover:bg-zinc-800 rounded transition-colors group/summary">
                              <span className="truncate">{res.change_summary || '—'}</span>
                              <ChevronRight className="w-3 h-3 opacity-0 group-hover/summary:opacity-100" />
                            </div>
                          </td>
                          <td className="p-3 border-r border-zinc-800 font-mono text-zinc-400 text-center" onClick={() => setActiveCode(res.student_code)}>{res.expected_grade}</td>
                          <td className="p-3 border-r border-zinc-800 text-center font-mono" onClick={() => setActiveCode(res.student_code)}>
                            {res.actual_grade !== undefined ? (
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] ${
                                res.actual_grade === res.expected_grade 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                {res.actual_grade}
                              </span>
                            ) : (
                              <RefreshCw className="w-3 h-3 animate-spin mx-auto text-zinc-700" />
                            )}
                          </td>
                          <td className="p-3 text-zinc-100 italic" onClick={() => setActiveFeedback(res)}>
                            <button className="w-full bg-zinc-950/50 rounded-lg p-2 text-[10px] border border-zinc-800/50 hover:bg-zinc-900 text-left transition-all flex items-center justify-between group/feedback">
                              <span className="truncate max-w-[200px]">
                                {res.comment ? res.comment.slice(0, 50) + '...' : 'Check pending...'}
                              </span>
                              <ChevronRight className="w-3 h-3 text-indigo-500 opacity-0 group-hover/feedback:opacity-100" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Submission Inspector & Live Checker Logs */}
              <div className="h-2/5 grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
                {/* Column 1: Submission Inspector */}
                <div className="flex flex-col bg-zinc-900 rounded-lg border border-zinc-800 shadow-2xl relative overflow-hidden group">
                  <div className="h-9 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 shrink-0">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {taskType === 'code' ? (
                          <Code2 className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <FileText className="w-3 h-3 text-indigo-500" />
                        )}
                        <span className="text-[11px] font-mono font-bold text-zinc-100 uppercase tracking-tight">
                          {activeCode 
                            ? (taskType === 'code' ? 'current_submission.py' : 'current_submission.txt') 
                            : (taskType === 'code' ? 'select_entry.sh' : 'select_entry.txt')}
                        </span>
                      </div>
                      <div className="h-4 w-px bg-zinc-800"></div>
                      <span className="text-[10px] text-zinc-500 italic">
                        {activeCode 
                          ? (taskType === 'code' ? 'Ready to execute' : 'Reviewing answer content') 
                          : 'Waiting for selection'}
                      </span>
                    </div>
                    
                    {activeCode && taskType === 'code' && (
                      <button 
                        onClick={() => runCode(activeCode)}
                        className="flex items-center gap-1.5 bg-zinc-100 px-3 py-1 rounded text-[10px] text-zinc-950 font-bold hover:bg-white transition-all active:scale-95"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        RUN
                      </button>
                    )}
                  </div>
                  
                  <div className="flex-1 flex overflow-hidden">
                    <div className="w-12 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center pt-3 text-[10px] font-mono text-zinc-600 select-none shrink-0 overflow-hidden">
                      {Array.from({ length: 10 }).map((_, i) => <span key={i}>{i+1}</span>)}
                    </div>
                    
                    <div className="flex-1 p-4 font-mono text-xs overflow-hidden leading-relaxed relative flex flex-col">
                      <div className="flex-1 overflow-auto scrollbar-thin">
                        <pre className="text-zinc-400 whitespace-pre-wrap break-all">
                          {activeCode || (taskType === 'code' 
                            ? '# Выберите строку из таблицы выше, чтобы просмотреть код решения студента.\n# Результаты анализа нейросети отображаются в таблице.'
                            : '# Выберите строку из таблицы выше, чтобы просмотреть текстовый ответ студента.\n# Результаты анализа нейросети отображаются в таблице.')}
                        </pre>
                      </div>
                      
                      {/* Overlay Console */}
                      <AnimatePresence>
                        {executionOutput && taskType === 'code' && (
                          <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 20, opacity: 0 }}
                            className="absolute inset-x-0 bottom-0 max-h-32 bg-zinc-950 border-t border-zinc-800 p-3 shadow-2xl overflow-y-auto font-mono text-[10px] scrollbar-thin"
                          >
                            <div className="flex justify-between items-center mb-2">
                               <span className="text-zinc-500 uppercase font-black tracking-widest text-[8px]">Console Output</span>
                               <button onClick={() => setExecutionOutput('')} className="text-zinc-600 hover:text-zinc-400">✕</button>
                            </div>
                            <div className={executionOutput.includes('Error') ? 'text-rose-500' : 'text-emerald-400'}>
                               {executionOutput}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Column 2: Live Activity Logs */}
                <div className="flex flex-col bg-zinc-900 rounded-lg border border-zinc-800 shadow-2xl relative overflow-hidden group">
                  <div className="h-9 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 shrink-0">
                    <div className="flex items-center gap-2">
                      <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
                      <span className="text-[11px] font-mono font-bold text-zinc-100 uppercase tracking-tight">
                        Логи проверки в реальном времени
                      </span>
                    </div>
                    {checkingLogs.length > 0 && (
                      <button 
                        onClick={() => setCheckingLogs([])}
                        className="text-[9px] text-zinc-500 hover:text-zinc-300 uppercase font-black tracking-widest font-mono"
                      >
                        Очистить логи
                      </button>
                    )}
                  </div>

                  <div className="flex-1 p-4 font-mono text-[10px] overflow-y-auto scrollbar-thin space-y-1 leading-normal bg-zinc-950/40">
                    {checkingLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic">
                        {loading ? 'Инициализация проверки...' : 'Нет активной сессии проверки. Нажмите кнопку "Start" в боковой панели, чтобы начать.'}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {checkingLogs.map((log) => {
                          let textClass = 'text-zinc-400';
                          let prefix = '•';
                          if (log.type === 'success') {
                            textClass = 'text-emerald-400';
                            prefix = '✔';
                          } else if (log.type === 'error') {
                            textClass = 'text-rose-400 font-bold';
                            prefix = '✘';
                          } else if (log.type === 'warning') {
                            textClass = 'text-amber-400';
                            prefix = '⚠';
                          } else if (log.type === 'pending') {
                            textClass = 'text-indigo-400';
                            prefix = '⏳';
                          }
                          return (
                            <div key={log.id} className={`flex items-start gap-2 ${textClass}`}>
                              <span className="text-zinc-600 select-none shrink-0">[{log.timestamp}]</span>
                              <span className="font-bold select-none shrink-0">{prefix}</span>
                              <span className="whitespace-pre-wrap break-all">{log.text}</span>
                            </div>
                          );
                        })}
                        <div ref={logsEndRef} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : viewMode === 'analytics' ? (
            <div className="flex-1 overflow-y-auto space-y-8 pb-12">
              <div className="grid grid-cols-1 gap-6">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">Prompts Performance Comparison</h4>
                    <button 
                      onClick={exportToExcel}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-[10px] uppercase font-black tracking-widest transition-all"
                    >
                      <Download className="w-3 h-3" />
                      Export Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          <th className="pb-3 font-normal">#</th>
                          <th className="pb-3 font-normal">Prompt (First 50 chars)</th>
                          <th className="pb-3 font-normal text-center">Accuracy</th>
                          <th className="pb-3 font-normal text-center">Correlation</th>
                          <th className="pb-3 font-normal text-center">MAE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const allMetrics = zadaniya.map((_, idx) => calculateMetrics(Array.isArray(results[idx]) ? results[idx] : []));
                          const maxAcc = Math.max(...allMetrics.map(m => m?.accuracy ?? -1));
                          const maxCorr = Math.max(...allMetrics.map(m => m?.correlation ?? -1));
                          const minMae = Math.min(...allMetrics.filter(m => m !== null).map(m => m!.mae), 100);

                          return zadaniya.map((zad, idx) => {
                            const taskResults = Array.isArray(results[idx]) ? results[idx] : [];
                            const metrics = allMetrics[idx];
                            const isAccWinner = metrics && metrics.accuracy === maxAcc && maxAcc > 0;
                            const isCorrWinner = metrics && metrics.correlation === maxCorr && maxCorr > 0;
                            const isMaeWinner = metrics && metrics.mae === minMae && metrics.mae < 100;

                            return (
                              <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${activeTaskIdx === idx ? 'bg-indigo-500/5' : ''}`}>
                                <td className="py-4 text-zinc-500 font-mono">{idx + 1}</td>
                                <td className="py-4 font-medium text-zinc-300">
                                  <div className="max-w-xs truncate" title={zad}>{zad.slice(0, 80)}...</div>
                                </td>
                                <td className="py-4 text-center">
                                  {metrics ? (
                                    <span className={`px-2 py-1 rounded font-mono ${isAccWinner ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-100'}`}>
                                      {(metrics.accuracy * 100).toFixed(0)}%
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className={`py-4 text-center font-mono ${isCorrWinner ? 'text-emerald-400 font-bold' : 'text-zinc-100'}`}>
                                  {metrics ? metrics.correlation.toFixed(2) : '—'}
                                </td>
                                <td className={`py-4 text-center font-mono ${isMaeWinner ? 'text-emerald-400 font-bold' : 'text-zinc-100'}`}>
                                  {metrics ? metrics.mae.toFixed(2) : '—'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>


                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl h-80">
                    <h4 className="text-[9px] uppercase font-black text-zinc-500 tracking-widest mb-4">Accuracy (%)</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={zadaniya.map((_, idx) => {
                          const metrics = calculateMetrics(Array.isArray(results[idx]) ? results[idx] : []);
                          return {
                            name: `P#${idx + 1}`,
                            val: metrics ? metrics.accuracy * 100 : 0
                          };
                        })}
                        margin={{ top: 10, right: 10, left: -30, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis dataKey="name" stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} />
                        <YAxis stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} domain={[0, 100]} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                          contentStyle={{ borderRadius: '12px', background: '#09090b', border: '1px solid #27272a', fontSize: '10px' }}
                        />
                        <Bar dataKey="val" fill="#6366f1" radius={[4, 4, 0, 0]} name="Accuracy" barSize={30}>
                           {zadaniya.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === activeTaskIdx ? '#818cf8' : '#312e81'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl h-80">
                    <h4 className="text-[9px] uppercase font-black text-zinc-500 tracking-widest mb-4">Correlation</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={zadaniya.map((_, idx) => {
                          const metrics = calculateMetrics(Array.isArray(results[idx]) ? results[idx] : []);
                          return {
                            name: `P#${idx + 1}`,
                            val: metrics ? metrics.correlation : 0
                          };
                        })}
                        margin={{ top: 10, right: 10, left: -30, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis dataKey="name" stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} />
                        <YAxis stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} domain={[0, 1]} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                          contentStyle={{ borderRadius: '12px', background: '#09090b', border: '1px solid #27272a', fontSize: '10px' }}
                        />
                        <Bar dataKey="val" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Correlation" barSize={30}>
                           {zadaniya.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === activeTaskIdx ? '#fcd34d' : '#92400e'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl h-80">
                    <h4 className="text-[9px] uppercase font-black text-zinc-500 tracking-widest mb-4">MAE (Lower is Better)</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={zadaniya.map((_, idx) => {
                          const metrics = calculateMetrics(Array.isArray(results[idx]) ? results[idx] : []);
                          return {
                            name: `P#${idx + 1}`,
                            val: metrics ? metrics.mae : 0
                          };
                        })}
                        margin={{ top: 10, right: 10, left: -30, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis dataKey="name" stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} />
                        <YAxis stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} domain={[0, 10]} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                          contentStyle={{ borderRadius: '12px', background: '#09090b', border: '1px solid #27272a', fontSize: '10px' }}
                        />
                        <Bar dataKey="val" fill="#f43f5e" radius={[4, 4, 0, 0]} name="MAE" barSize={30}>
                           {zadaniya.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === activeTaskIdx ? '#fb7185' : '#9f1239'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl h-96">
                    <h4 className="text-[10px] uppercase font-black text-zinc-500 tracking-widest mb-6">Plan vs Fact Comparison (Current Prompt: {activeTaskIdx + 1})</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(Array.isArray(results[activeTaskIdx]) ? results[activeTaskIdx] : []).map((r, i) => ({
                          id: i + 1,
                          plan: r.expected_grade,
                          fact: r.actual_grade || 0
                        }))}
                        margin={{ top: 20, right: 30, left: -20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis dataKey="id" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 10]} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                          contentStyle={{ borderRadius: '12px', background: '#09090b', border: '1px solid #27272a' }}
                        />
                        <Bar dataKey="plan" fill="#1e1b4b" radius={[4, 4, 0, 0]} name="Plan Grade" barSize={20} />
                        <Bar dataKey="fact" fill="#10b981" radius={[4, 4, 0, 0]} name="AI Fact Grade" barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
              </div>
            </div>
          ) : viewMode === 'prompts' ? (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-5xl mx-auto space-y-8">
                
                {/* Header Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                      <Scissors className="w-6 h-6 text-indigo-400" />
                      Сократитель промптов & Шаблоны
                    </h2>
                    <p className="text-zinc-500 text-sm mt-1">
                      Сокращайте развернутый текст исходного домашнего задания в краткие промпты (Task Definitions) на основе выбранных образцов.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (!rawHomeworkInput && zadaniya.length > 0 && zadaniya[0]) {
                        setRawHomeworkInput(zadaniya[0]);
                      }
                      setIsCompressModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)] active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Открыть сократитель промптов</span>
                  </button>
                </div>

                {/* Reference Prompt Templates Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-400" />
                        Образцы и Шаблоны промптов
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">Примеры оформления промптов, на которые ориентируется AI при сокращении текста ДЗ.</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTemplateId('template_goal');
                        setIsCompressModalOpen(true);
                        setIsSavingTemplate(true);
                      }}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span>Создать свой шаблон</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {allPromptTemplates.map((template) => {
                      const isSelected = selectedTemplateId === template.id;
                      const isCustom = template.id.startsWith('custom_');

                      return (
                        <div 
                          key={template.id} 
                          className={`p-5 rounded-2xl border transition-all flex flex-col justify-between relative group ${
                            isSelected 
                              ? 'bg-indigo-950/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">
                                {isCustom ? 'Ваш шаблон' : 'Встроенный'}
                              </span>
                              {isCustom && (
                                <button
                                  onClick={() => handleDeleteCustomTemplate(template.id)}
                                  className="p-1 hover:bg-rose-500/10 text-rose-500/40 hover:text-rose-500 rounded transition-colors"
                                  title="Удалить данный шаблон"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <h4 className="text-xs font-bold text-white">{template.name}</h4>
                            <p className="text-[10px] text-zinc-400 leading-relaxed">{template.description}</p>
                            
                            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-[10px] font-mono text-zinc-400 max-h-32 overflow-y-auto scrollbar-thin">
                              {template.content}
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedTemplateId(template.id);
                              setCustomTemplateInput(template.content);
                              setIsCompressModalOpen(true);
                            }}
                            className="w-full mt-4 py-2 bg-zinc-800 hover:bg-indigo-600 text-zinc-300 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                          >
                            <Scissors className="w-3 h-3" />
                            <span>Использовать как образец</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* System Prompts Section */}
                <div className="space-y-4 pt-6 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-zinc-400" />
                        Системные промпты платформы
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">Внутренние системные инструкции нейросети для оценки и генерации тест-кейсов.</p>
                    </div>
                    <div className="px-3 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-full text-[10px] font-bold uppercase tracking-widest">
                       System Default
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {prompts.map(prompt => (
                      <div key={prompt.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/40">
                           <div>
                             <h4 className="text-xs font-bold text-zinc-100">{prompt.name}</h4>
                             <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight mt-0.5">{prompt.description}</p>
                           </div>
                        </div>
                        <div className="p-5">
                          <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4 font-mono text-[10px] text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto scrollbar-thin">
                            {prompt.content}
                          </div>
                        </div>
                      </div>
                    ))}
                    {prompts.length === 0 && (
                       <div className="p-12 text-center text-zinc-700 italic border border-zinc-800 border-dashed rounded-3xl">
                         <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 opacity-20" />
                         Загрузка системных шаблонов...
                       </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ) : viewMode === 'optimization' ? (
            <div className="flex-1 overflow-auto p-8 bg-zinc-950/20">
              <div className="max-w-5xl mx-auto space-y-6">
                
                {/* Header with main action & stop buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                      <Wand2 className="w-6 h-6 text-indigo-400" />
                      Промпт-Оптимизатор (GPT 5.4 Judge)
                    </h2>
                    <p className="text-zinc-500 text-sm mt-1">
                      Циклическая автонастройка промпта задания (Task Definition) на основе эталонных критериев и учебных кейсов.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {(optimizationResult?.final_prompt || optHistory.length > 0) && (
                      <button
                        onClick={() => setIsOptResultModalOpen(true)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span>Итоговый промпт</span>
                      </button>
                    )}

                    <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-xl hover:border-zinc-700 transition-colors select-none">
                      <input 
                        type="checkbox" 
                        checked={forceOptRegenerate} 
                        onChange={e => setForceOptRegenerate(e.target.checked)} 
                        className="rounded border-zinc-700 bg-zinc-950 text-indigo-500 focus:ring-0" 
                      />
                      <span>Перегенерировать кейсы из меню ({numCorrect || 0} Pass, {numIncorrect || 0} Fail)</span>
                    </label>

                    {isOptimizing ? (
                      <button
                        onClick={handleStopOptimization}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
                      >
                        <Square className="w-3.5 h-3.5 fill-rose-400" />
                        Остановить
                      </button>
                    ) : (
                      <button
                        disabled={loading}
                        onClick={handleOptimizePrompt}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] active:scale-95 animate-pulse"
                      >
                        <Brain className="w-4 h-4" />
                        Запустить оптимизацию
                      </button>
                    )}
                  </div>
                </div>

                {/* Real-time Status / Wizard Stage Display */}
                {(isOptimizing || optStage !== 'idle') && (
                  <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-6 shadow-xl">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Текущее состояние</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                        optStage === 'finished' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        optStage === 'generating_cases' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      } uppercase`}>
                        {optStage === 'initializing' && 'Инициализация'}
                        {optStage === 'generating_cases' && 'Генерация тест-кейсов'}
                        {optStage === 'evaluating_and_tuning' && `Цикл #${optIteration}`}
                        {optStage === 'finished' && 'Завершено'}
                      </span>
                    </div>

                    {/* Progress stage steps */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                      {[
                        { key: 'initializing', label: '1. Инициализация', desc: 'Настройка окружения' },
                        { key: 'generating_cases', label: '2. Тест-кейсы', desc: 'Генерация учебной выборки' },
                        { key: 'evaluating_and_tuning', label: `3. Проверка и Оптимизация`, desc: optIteration > 0 ? `Активен цикл #${optIteration}` : 'Запуск проверки' },
                        { key: 'finished', label: '4. Готово', desc: 'Промпт зафиксирован' }
                      ].map((s, idx) => {
                        const isCurrent = optStage === s.key || (s.key === 'evaluating_and_tuning' && optStage === 'evaluating_and_tuning');
                        const isPast = 
                          (s.key === 'initializing' && optStage !== 'initializing') ||
                          (s.key === 'generating_cases' && !['initializing', 'generating_cases'].includes(optStage)) ||
                          (s.key === 'evaluating_and_tuning' && optStage === 'finished');

                        return (
                          <div 
                            key={idx} 
                            className={`p-4 rounded-xl border transition-all ${
                              isCurrent ? 'bg-indigo-950/20 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.05)]' :
                              isPast ? 'bg-emerald-950/5 border-emerald-500/20 opacity-70' :
                              'bg-zinc-900/10 border-zinc-900 opacity-40'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isPast ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              ) : isCurrent && isOptimizing ? (
                                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                              ) : (
                                <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-indigo-400 animate-pulse' : 'bg-zinc-600'}`} />
                              )}
                              <span className={`text-[11px] font-bold ${isCurrent ? 'text-indigo-200' : isPast ? 'text-emerald-200' : 'text-zinc-500'}`}>
                                {s.label}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-1 pl-4 leading-normal">{s.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Metrics / Improvement Summary Tracker (Dashboard) */}
                {optHistory.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* MAE Improvement Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Качество проверки (MAE)</span>
                          <TrendingUp className="w-4 h-4 text-rose-400" />
                        </div>
                        <div className="mt-4 flex items-baseline gap-3">
                          <span className="text-3xl font-black text-white">{optHistory[optHistory.length - 1].mae}</span>
                          <span className="text-xs text-zinc-500">баллов ошибки</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-2">
                          Среднее абсолютное отклонение от оценок куратора. Чем ближе к 0.00, тем точнее.
                        </p>
                      </div>
                      <div className="pt-4 border-t border-zinc-800/60 mt-4 flex justify-between items-center text-[10px]">
                        <span className="text-zinc-500">На старте: <strong className="text-zinc-400 font-bold">{optHistory[0].mae}</strong></span>
                        <span className="text-emerald-400 font-black flex items-center gap-0.5 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                          Улучшено на {Math.max(0, Number(optHistory[0].mae) - Number(optHistory[optHistory.length - 1].mae)).toFixed(2)} б.
                        </span>
                      </div>
                    </div>

                    {/* Accuracy Percentage Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Точность совпадения</span>
                          <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="mt-4 flex items-baseline gap-3">
                          <span className="text-3xl font-black text-white">{optHistory[optHistory.length - 1].accuracy}%</span>
                          <span className="text-xs text-zinc-500">полных совпадений</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-2">
                          Процент тест-кейсов, на которых оценка ИИ полностью совпала с оценкой куратора.
                        </p>
                      </div>
                      <div className="pt-4 border-t border-zinc-800/60 mt-4 flex justify-between items-center text-[10px]">
                        <span className="text-zinc-500">На старте: <strong className="text-zinc-400 font-bold">{optHistory[0].accuracy}%</strong></span>
                        <span className="text-emerald-400 font-black flex items-center gap-0.5 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                          Прирост: +{optHistory[optHistory.length - 1].accuracy - optHistory[0].accuracy}%
                        </span>
                      </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Общий прогресс по циклам</span>
                        <div className="space-y-3 mt-4">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-zinc-400">Пройдено итераций:</span>
                            <span className="font-mono text-zinc-200 font-bold">{optHistory.length} / 20</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-zinc-400">Осталось расхождений:</span>
                            <span className={`font-mono font-bold ${optHistory[optHistory.length - 1].mismatches.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {optHistory[optHistory.length - 1].mismatches.length} кейсов
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-zinc-400">Затраты на ИИ (руб):</span>
                            <span className="font-mono text-indigo-400 font-black">
                              {optHistory.reduce((sum: number, s: any) => sum + (s.cost_rub || 0), 0).toFixed(2)} ₽
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-zinc-400">Потребление токенов:</span>
                            <span className="font-mono text-zinc-200">
                              {(optimizationResult?.total_tokens_used || optHistory.reduce((sum: number, s: any) => sum + (s.total_tokens_used || 0), 0)).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-zinc-800/60 mt-4 text-[10px] text-zinc-500 italic leading-snug">
                        {optHistory[optHistory.length - 1].mismatches.length === 0 
                          ? "✨ Идеальное соответствие оценок куратора достигнуто!" 
                          : "🤖 Модель GPT 5.4 продолжает искать лучшие формулировки..."
                        }
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Column: Console/Logs */}
                  <div className="md:col-span-1 flex flex-col">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[400px]">
                      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Лог оптимизации</span>
                        {isOptimizing && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>}
                      </div>
                      <div className="p-4 flex-1 overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-1.5 bg-zinc-950 scrollbar-thin">
                        {optLogs.map((log, idx) => (
                          <div key={idx} className={
                            log.includes('❌') ? 'text-rose-400' :
                            log.includes('✔') ? 'text-emerald-400' :
                            log.includes('✨') ? 'text-indigo-400 font-bold' :
                            log.includes('🛑') ? 'text-rose-500 font-bold' :
                            'text-zinc-400'
                          }>
                            {log}
                          </div>
                        ))}
                        {optLogs.length === 0 && (
                          <p className="text-zinc-600 italic text-center py-32">Консоль пуста. Нажмите кнопку выше для старта.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Iteration history */}
                  <div className="md:col-span-2 space-y-6">
                    {optHistory.length > 0 ? (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500">История итераций</h4>
                        
                        {/* Staggered list from newest to oldest */}
                        {[...optHistory].reverse().map((step: any, idx: number) => (
                          <div key={step.iteration} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg">
                            <div className="p-5 border-b border-zinc-800 bg-zinc-950/40 flex justify-between items-center">
                              <div>
                                <span className="text-xs font-black uppercase tracking-widest text-indigo-400">Итерация #{step.iteration}</span>
                                <h5 className="text-[10px] text-zinc-500 mt-0.5 uppercase font-bold">
                                  MAE: <span className="text-zinc-300">{step.mae}</span> | 
                                  Расхождения: <span className={step.mismatches.length > 0 ? 'text-rose-400' : 'text-emerald-400'}>{step.mismatches.length}</span> | 
                                  Затраты: <span className="text-indigo-400 font-mono">{(step.cost_rub || 0).toFixed(2)} ₽</span>
                                  {step.curator_errors_count > 0 && (
                                    <> | <span className="text-amber-400">⚠️ {step.curator_errors_count} ошибки куратора</span></>
                                  )}
                                </h5>
                              </div>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                step.mismatches.length === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {step.mismatches.length === 0 ? 'Пройдено' : `${step.mismatches.length} расхождений`}
                              </span>
                            </div>

                            <div className="p-6 space-y-6">
                              {/* Case Results list */}
                              <div className="space-y-2">
                                <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Результаты тестирования промпта:</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {step.results.map((res: any, cIdx: number) => (
                                    <div key={cIdx} className={`p-3 bg-zinc-950 border rounded-xl flex items-start gap-2 ${
                                      res.isCuratorError ? 'border-amber-500/20 bg-amber-500/[0.01]' : 'border-zinc-900'
                                    }`}>
                                      <div className="mt-0.5">
                                        {res.isCuratorError ? (
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 block animate-pulse"></span>
                                        ) : res.isMatch ? (
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block animate-pulse"></span>
                                        ) : (
                                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 block animate-pulse"></span>
                                        )}
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex justify-between items-center text-[10px]">
                                          <span className="font-bold text-zinc-300 font-mono">Кейс #{res.caseIndex + 1} ({res.type})</span>
                                          <div className="flex items-center gap-1.5">
                                            {res.isCuratorError && (
                                              <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[8px] font-bold">
                                                Ошибка куратора
                                              </span>
                                            )}
                                            <span className={res.isCuratorError ? 'text-amber-400 font-bold' : res.isMatch ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                              {res.actual_grade} / {res.expected_grade}
                                              {res.isCuratorError && res.correctedExpectedGrade !== undefined && res.correctedExpectedGrade !== res.expected_grade && (
                                                <span className="text-[9px] text-amber-400 font-normal ml-1">
                                                  → {res.correctedExpectedGrade}
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                        <p className="text-[9px] text-zinc-500 mt-1 line-clamp-2 italic">
                                          "{res.comment || 'Без комментария'}"
                                        </p>
                                        {res.isCuratorError && (
                                          <div className="text-[9px] text-amber-400 mt-1.5 bg-amber-500/5 p-2 rounded border border-amber-500/10 text-left leading-normal whitespace-pre-wrap">
                                            💡 <strong>Анализ GPT 5.4:</strong> {res.curatorErrorReason}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Critique/Analysis Box */}
                              <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-2">
                                <div className="flex items-center gap-2">
                                  <Brain className="w-4 h-4 text-indigo-400" />
                                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">Анализ судьи GPT 5.4</span>
                                </div>
                                <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap text-left">
                                  {step.analysis}
                                </p>
                              </div>

                              {/* View System Prompt Code */}
                              <details className="group border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/20">
                                <summary className="p-3 text-[10px] font-black uppercase text-zinc-500 cursor-pointer select-none hover:text-zinc-300 transition-colors flex justify-between items-center">
                                  <span>Посмотреть оптимизированный промпт задания (Task Definition)</span>
                                  <ChevronRight className="w-3.5 h-3.5 transform group-open:rotate-90 transition-transform" />
                                </summary>
                                <div className="p-4 border-t border-zinc-800 font-mono text-[10px] text-zinc-400 whitespace-pre-wrap bg-zinc-950 max-h-60 overflow-y-auto leading-relaxed text-left">
                                  {step.optimized_prompt}
                                </div>
                              </details>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-16 text-center border border-zinc-800 border-dashed rounded-3xl flex flex-col items-center justify-center space-y-4">
                        <Wand2 className="w-12 h-12 text-zinc-700 animate-pulse" />
                        <h4 className="text-sm font-bold text-zinc-400">Промпт еще не оптимизировался</h4>
                        <p className="text-xs text-zinc-600 max-w-sm">
                          Запустите цикл самоулучшения. Система автоматически проверит тест-кейсы и настроит промпт с помощью GPT 5.4.
                        </p>
                        <button
                          disabled={isOptimizing || loading}
                          onClick={handleOptimizePrompt}
                          className="px-5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                        >
                          Запустить оптимизацию
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : viewMode === 'history' ? (
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">История запусков</h2>
                    <p className="text-zinc-500 text-sm mt-1">
                      Здесь отображаются ваши прошлые сессии проверки. Вы можете быстро восстановить их поля или запустить проверку повторно.
                    </p>
                  </div>
                  {runsHistory.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm('Вы уверены, что хотите полностью очистить историю запусков?')) {
                          setRunsHistory([]);
                          localStorage.removeItem('neurochecker_v3_runs_history');
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[10px] uppercase font-black tracking-widest border border-rose-500/20 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                      Очистить историю
                    </button>
                  )}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                        <History className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="flex flex-col">
                        <h4 className="text-[10px] uppercase font-black text-zinc-100 tracking-widest leading-none">Предыдущие запуски</h4>
                        <span className="text-[9px] text-zinc-500 mt-1 uppercase font-bold tracking-tight">Список последних сессий ({runsHistory.length})</span>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-zinc-950 text-zinc-500 font-mono uppercase text-[9px] tracking-widest sticky top-0 z-10 border-b border-zinc-800">
                        <tr>
                          <th className="p-4 font-normal">Дата и Время</th>
                          <th className="p-4 font-normal">Тема / Промпты</th>
                          <th className="p-4 font-normal">Модель / Формат</th>
                          <th className="p-4 font-normal text-right">Стоимость / Токены</th>
                          <th className="p-4 font-normal text-right">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {runsHistory.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-20 text-center text-zinc-700 italic">
                              <History className="w-12 h-12 mx-auto mb-4 opacity-10 text-zinc-400" />
                              История запусков пуста. Запустите первую проверку, чтобы она сохранилась здесь.
                            </td>
                          </tr>
                        ) : (
                          runsHistory.map((run) => (
                            <tr key={run.id} className="hover:bg-zinc-900/50 transition-colors group">
                              <td className="p-4 font-mono text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                {new Date(run.timestamp).toLocaleString('ru-RU')}
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col gap-1 max-w-sm">
                                  <span className="text-zinc-200 font-bold text-sm truncate" title={run.tema}>
                                    {run.tema || <span className="text-zinc-600 italic">Без темы</span>}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    Заданий: {run.zadaniya?.length || 0} • Кейсов: {run.testCases?.length || ((run.numCorrect || 0) + (run.numIncorrect || 0))}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-zinc-300 font-mono text-xs">{run.model}</span>
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                                    {run.taskType === 'code' ? '💻 Ноутбук' : '📝 Ссылка/Текст'}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-mono font-bold text-indigo-400 text-sm">
                                    {run.totalCost?.toFixed(4) || '0.0000'} ₽
                                  </span>
                                  <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mt-0.5">Итоговая Стоимость</span>
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      loadPastRunState(run);
                                      setViewMode('code');
                                    }}
                                    title="Заполнить поля этой конфигурацией и открыть результаты"
                                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all"
                                  >
                                    Посмотреть результаты
                                  </button>
                                  <button
                                    onClick={() => {
                                      loadPastRunState(run);
                                      alert('Поля заполнены значениями из этого запуска!');
                                    }}
                                    title="Только заполнить поля формы без запуска"
                                    className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-[10px] uppercase font-black tracking-widest border border-indigo-500/20 transition-all"
                                  >
                                    Заполнить поля
                                  </button>
                                  <button
                                    onClick={() => {
                                      loadPastRunState(run);
                                      setViewMode('code');
                                      setTimeout(() => {
                                        handleStart(run);
                                      }, 100);
                                    }}
                                    title="Заполнить поля и запустить проверку повторно"
                                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg text-[10px] uppercase font-black tracking-widest transition-all active:scale-95"
                                  >
                                    Запустить снова
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm('Удалить эту сессию из истории?')) {
                                        setRunsHistory(prev => {
                                          const next = prev.filter(r => r.id !== run.id);
                                          localStorage.setItem('neurochecker_v3_runs_history', JSON.stringify(next));
                                          return next;
                                        });
                                      }
                                    }}
                                    title="Удалить из истории"
                                    className="p-1 hover:bg-rose-500/10 text-rose-500/40 hover:text-rose-500 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                      <Settings className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="flex flex-col">
                      <h4 className="text-[10px] uppercase font-black text-zinc-100 tracking-widest leading-none">Application Usage Logs</h4>
                      <span className="text-[9px] text-zinc-500 mt-1 uppercase font-bold tracking-tight">Audit trail for API calls & tokens</span>
                    </div>
                  </div>
                  <button 
                    onClick={fetchLogs} 
                    className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-4 py-2 rounded-lg text-[10px] uppercase font-black tracking-widest transition-all active:scale-95"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh Logs
                  </button>
                </div>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-950 text-zinc-500 font-mono uppercase text-[9px] tracking-widest sticky top-0 z-10 border-b border-zinc-800">
                      <tr>
                        <th className="p-4 font-normal">Timestamp</th>
                        <th className="p-4 font-normal">User Email</th>
                        <th className="p-4 font-normal">Action Type</th>
                        <th className="p-4 font-normal text-right">Стоимость (₽)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {usageLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-20 text-center text-zinc-700 italic">No usage history recorded yet.</td>
                        </tr>
                      ) : (
                        [...usageLogs].reverse().map((log, i) => (
                          <tr key={i} className="hover:bg-zinc-900/50 transition-colors group">
                            <td className="p-4 font-mono text-zinc-500 group-hover:text-zinc-400 transition-colors">
                              {new Date(log.timestamp).toLocaleString('ru-RU')}
                            </td>
                            <td className="p-4">
                              <span className="text-zinc-300 font-medium px-2 py-1 bg-zinc-950 rounded border border-zinc-800 group-hover:border-zinc-700 transition-colors">
                                {log.email}
                              </span>
                            </td>
                            <td className="p-4 text-zinc-400 italic text-[11px] max-w-xs truncate" title={log.action}>
                              {log.action}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className={`font-mono font-bold ${log.cost_rub > 0 ? 'text-indigo-400' : 'text-zinc-600'}`}>
                                  {log.cost_rub?.toFixed(4) || '0.0000'}
                                </span>
                                <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-tighter">Rubles</span>
                                <span className="text-[7px] text-zinc-700 font-mono">({log.tokens.toLocaleString()} tokens)</span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
        <AnimatePresence>
          {activeFeedback && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
              onClick={() => setActiveFeedback(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <h3 className="text-lg font-bold text-zinc-100">Full AI Feedback</h3>
                  </div>
                  <button onClick={() => setActiveFeedback(null)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors">✕</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[10px] uppercase font-black text-indigo-400 tracking-widest">{activeFeedback.full_feedback?.topic || activeFeedback.type}</h4>
                       <span className="text-[10px] font-mono text-zinc-600">Grade: {activeFeedback.actual_grade}/10</span>
                    </div>
                    
                    <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                      {formatFullFeedback(activeFeedback)}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-zinc-800 bg-zinc-950/30 flex justify-end">
                  <button 
                    onClick={() => setActiveFeedback(null)}
                    className="px-6 py-2 bg-zinc-100 text-zinc-950 font-bold rounded-lg text-xs hover:bg-white transition-colors"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeSummary && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
              onClick={() => setActiveSummary(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-widest">Change Summary</h3>
                  <button onClick={() => setActiveSummary(null)} className="text-zinc-500 hover:text-white">✕</button>
                </div>
                <div className="p-8 text-zinc-200 leading-relaxed font-mono text-sm max-h-96 overflow-y-auto">
                   {activeSummary.change_summary || "No summary provided."}
                </div>
                <div className="p-6 bg-zinc-950/50 border-t border-zinc-800 flex justify-end">
                   <button onClick={() => setActiveSummary(null)} className="px-6 py-2 bg-zinc-800 rounded-lg text-xs font-bold hover:bg-zinc-700">Close</button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Prompt Compressor Modal */}
          {isCompressModalOpen && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                      <Scissors className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                        Сокращение промпта из исходного ДЗ
                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] rounded-full font-mono uppercase font-semibold">
                          Prompt Engineering
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Преобразование развернутого текста домашнего задания в краткий промпт (Task Definition) по вашему шаблону.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsCompressModalOpen(false)}
                    className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Left Column: Inputs & Templates */}
                    <div className="space-y-5">
                      
                      {/* Step 1: Raw Homework text */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-400" />
                            1. Исходный текст задания (из ДЗ)
                          </label>
                          <div className="flex items-center gap-2">
                            {zadaniya.length > 0 && (
                              <button
                                onClick={() => setRawHomeworkInput(zadaniya[activeTaskIdx] || zadaniya[0] || '')}
                                className="text-[9px] text-zinc-400 hover:text-indigo-300 underline"
                              >
                                Из Задания #{activeTaskIdx + 1}
                              </button>
                            )}
                            {etalonText && (
                              <button
                                onClick={() => setRawHomeworkInput(etalonText)}
                                className="text-[9px] text-zinc-400 hover:text-indigo-300 underline"
                              >
                                Из Эталона
                              </button>
                            )}
                          </div>
                        </div>
                        <textarea
                          value={rawHomeworkInput}
                          onChange={e => setRawHomeworkInput(e.target.value)}
                          placeholder="Вставьте сущность или полный текст формулировки домашнего задания из исходных материалов..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors h-36 resize-none font-mono scrollbar-thin"
                        />
                      </div>

                      {/* Step 2: Template Selection & Editing */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            2. Шаблон / Примеры для ориентации
                          </label>
                          <button
                            onClick={() => setIsSavingTemplate(!isSavingTemplate)}
                            className="text-[9px] text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"
                          >
                            <Save className="w-2.5 h-2.5" />
                            Сохранить этот шаблон
                          </button>
                        </div>

                        {/* Select existing template */}
                        <div className="grid grid-cols-1 gap-2">
                          <select
                            value={selectedTemplateId}
                            onChange={e => setSelectedTemplateId(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500/50 font-medium"
                          >
                            <optgroup label="Встроенные шаблоны">
                              {defaultPromptTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </optgroup>
                            {customPromptTemplates.length > 0 && (
                              <optgroup label="Ваши сохраненные шаблоны">
                                {customPromptTemplates.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>

                        {/* Optional inline save template box */}
                        {isSavingTemplate && (
                          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                            <div className="text-[10px] font-bold text-amber-300 uppercase">Сохранить как новый шаблон</div>
                            <input 
                              type="text" 
                              placeholder="Название шаблона (напр. Мой критериальный промпт)" 
                              value={newTemplateName}
                              onChange={e => setNewTemplateName(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-zinc-200 focus:outline-none"
                            />
                            <input 
                              type="text" 
                              placeholder="Короткое описание" 
                              value={newTemplateDesc}
                              onChange={e => setNewTemplateDesc(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-zinc-200 focus:outline-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => setIsSavingTemplate(false)}
                                className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                              >
                                Отмена
                              </button>
                              <button 
                                onClick={handleSaveCustomTemplate}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded text-[10px]"
                              >
                                Сохранить
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Template / Example Text Editor */}
                        <div className="space-y-1">
                          <span className="text-[9px] text-zinc-500">Текст примеров/шаблонов, на которые AI будет равняться:</span>
                          <textarea
                            value={customTemplateInput}
                            onChange={e => setCustomTemplateInput(e.target.value)}
                            placeholder="Сюда можно вставлять примеры уже готовых успешных промптов, чтобы AI ориентировался на их структуру и формулировки..."
                            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors h-36 resize-none font-mono text-[11px] scrollbar-thin"
                          />
                        </div>

                        {/* Action trigger button */}
                        <button
                          disabled={isCompressing || !rawHomeworkInput.trim()}
                          onClick={handleCompressPrompt}
                          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-40 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(99,102,241,0.25)] flex items-center justify-center gap-2 active:scale-[0.99]"
                        >
                          {isCompressing ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Генерация и сокращение...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>Сгенерировать краткий промпт</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Right Column: Output & Actions */}
                    <div className="space-y-4 flex flex-col justify-between">
                      <div className="space-y-3 flex-1 flex flex-col">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            3. Результат (Краткий промпт)
                          </label>
                          {compressResult && (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono rounded font-bold">
                                -{compressResult.reduction_percent}% сжатия
                              </span>
                              <span className="text-[9px] text-zinc-500 font-mono">
                                {compressResult.original_char_count} → {compressResult.compressed_char_count} симв.
                              </span>
                            </div>
                          )}
                        </div>

                        {compressResult ? (
                          <div className="space-y-3 flex-1 flex flex-col">
                            {/* AI Explanation Banner */}
                            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-start gap-2">
                              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold block text-[10px] uppercase tracking-wider text-indigo-300">Пояснение AI-методиста</span>
                                <p className="text-[11px] leading-relaxed text-zinc-300 mt-0.5">{compressResult.explanation}</p>
                              </div>
                            </div>

                            {/* Compressed Prompt Output Textarea */}
                            <textarea
                              value={compressResult.compressed_prompt}
                              onChange={e => setCompressResult({ ...compressResult, compressed_prompt: e.target.value })}
                              className="w-full bg-zinc-950 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-200 focus:outline-none focus:border-emerald-500/60 transition-colors flex-1 min-h-[220px] font-mono leading-relaxed scrollbar-thin"
                            />

                            {/* Quick Apply Actions */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                              <button
                                onClick={() => {
                                  const upd = [...zadaniya];
                                  if (upd.length === 0) {
                                    upd.push(compressResult.compressed_prompt);
                                  } else {
                                    upd[activeTaskIdx] = compressResult.compressed_prompt;
                                  }
                                  setZadaniya(upd);
                                  setIsCompressModalOpen(false);
                                }}
                                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Заменить Задание #{activeTaskIdx + 1}</span>
                              </button>

                              <button
                                onClick={() => {
                                  setZadaniya([...zadaniya, compressResult.compressed_prompt]);
                                  setIsCompressModalOpen(false);
                                }}
                                className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-indigo-300 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all border border-zinc-700 flex items-center justify-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Добавить как новое задание</span>
                              </button>
                            </div>

                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(compressResult.compressed_prompt);
                                setCopiedCompressResult(true);
                                setTimeout(() => setCopiedCompressResult(false), 2000);
                              }}
                              className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1.5"
                            >
                              {copiedCompressResult ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedCompressResult ? 'Скопировано в буфер!' : 'Скопировать текст промпта'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="h-full border border-zinc-800 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-zinc-950/40">
                            <Scissors className="w-10 h-10 text-zinc-700 mb-3" />
                            <h4 className="text-sm font-bold text-zinc-400">Результат появится здесь</h4>
                            <p className="text-xs text-zinc-600 max-w-xs mt-1">
                              Заполните исходный текст домашнего задания слева, выберите или настройте шаблон и нажмите «Сгенерировать краткий промпт».
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Optimization Final Prompt Result Modal */}
          {isOptResultModalOpen && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col my-8"
              >
                {/* Modal Header */}
                <div className="p-6 border-b border-zinc-800 bg-gradient-to-r from-indigo-950/80 via-zinc-900 to-zinc-950 flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        Оптимизированный промпт готов!
                        <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] rounded-full font-mono uppercase font-bold">
                          GPT 5.4 Judge
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Итоговый скорректированный Task Definition для автоматической проверки решений студентов.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOptResultModalOpen(false)}
                    className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5">
                  {/* Summary Stats */}
                  {optHistory.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl text-center">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">Итераций</span>
                        <p className="text-base font-black text-white mt-0.5 font-mono">{optHistory.length}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">Финальный MAE</span>
                        <p className="text-base font-black text-emerald-400 mt-0.5 font-mono">
                          {optHistory[optHistory.length - 1].mae} б.
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">Точность</span>
                        <p className="text-base font-black text-indigo-400 mt-0.5 font-mono">
                          {optHistory[optHistory.length - 1].accuracy}%
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Prompt Text Display */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                        Текст оптимизированного промпта (Task Definition)
                      </label>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {(optimizationResult?.final_prompt || zadaniya[0] || '').length} символов
                      </span>
                    </div>

                    <textarea
                      readOnly
                      value={optimizationResult?.final_prompt || zadaniya[0] || ''}
                      className="w-full bg-zinc-950 border border-emerald-500/30 rounded-2xl p-4 text-xs text-emerald-200 font-mono leading-relaxed h-64 focus:outline-none focus:border-emerald-500/60 transition-colors scrollbar-thin select-all"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    {/* Copy Button */}
                    <button
                      onClick={() => {
                        const textToCopy = optimizationResult?.final_prompt || zadaniya[0] || '';
                        navigator.clipboard.writeText(textToCopy);
                        setCopiedOptResultPrompt(true);
                        setTimeout(() => setCopiedOptResultPrompt(false), 2500);
                      }}
                      className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] flex items-center justify-center gap-2 active:scale-95"
                    >
                      {copiedOptResultPrompt ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>Скопировано!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Скопировать промпт</span>
                        </>
                      )}
                    </button>

                    {/* Replace Task 1 Button */}
                    <button
                      onClick={() => {
                        const updatedPrompt = optimizationResult?.final_prompt || zadaniya[0] || '';
                        setZadaniya(prev => {
                          const upd = [...prev];
                          if (upd.length === 0) upd.push(updatedPrompt);
                          else upd[0] = updatedPrompt;
                          return upd;
                        });
                        setIsOptResultModalOpen(false);
                      }}
                      className="py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Применить к Заданию #1</span>
                    </button>

                    {/* Add as New Task Button */}
                    <button
                      onClick={() => {
                        const updatedPrompt = optimizationResult?.final_prompt || zadaniya[0] || '';
                        setZadaniya(prev => [...prev, updatedPrompt]);
                        setIsOptResultModalOpen(false);
                      }}
                      className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-xs uppercase tracking-wider transition-all border border-zinc-700 flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Plus className="w-4 h-4 text-indigo-400" />
                      <span>Добавить новым заданием</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
  );
}

