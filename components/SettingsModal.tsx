"use client";

/**
 * Settings Modal — Configure LLM provider with model fetching,
 * test connection, and save/load settings.
 *
 * Supports: OpenAI, Ollama, LM Studio, Gemini, Anthropic
 */
import { useState, useCallback, useEffect } from "react";
import { LLMConfig, LLMProviderType } from "@/lib/types/bot";
import { DEFAULT_CONFIGS, PROVIDER_INFO } from "@/lib/llm/provider";

interface ModelInfo {
    id: string;
    name: string;
    type?: string;
    state?: string;
}

interface SettingsModalProps {
    config: LLMConfig;
    onChange: (config: LLMConfig) => void;
    onClose: () => void;
}

const STORAGE_KEY = "battlebots-llm-settings";

/** Save settings to localStorage */
function saveSettings(config: LLMConfig) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
        // pass — localStorage might not be available
    }
}

/** Load settings from localStorage */
export function loadSettings(): LLMConfig | null {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) return JSON.parse(data) as LLMConfig;
    } catch {
        // pass
    }
    return null;
}

// Provider ordering for the UI
const PROVIDER_ORDER: LLMProviderType[] = [
    "lmstudio",
    "ollama",
    "openai",
    "gemini",
    "anthropic",
];

export default function SettingsModal({
    config,
    onChange,
    onClose,
}: SettingsModalProps) {
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{
        success: boolean;
        message: string;
    } | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    const providerInfo = PROVIDER_INFO[config.provider];
    const canFetchModels =
        config.provider === "lmstudio" || config.provider === "ollama";

    // Fetch models when switching to a provider that supports it
    const fetchModels = useCallback(async () => {
        if (!canFetchModels) return;

        setIsLoadingModels(true);
        setModelError(null);
        setModels([]);

        try {
            const params = new URLSearchParams({
                provider: config.provider,
                baseUrl: config.baseUrl,
            });
            const response = await fetch(`/api/list-models?${params}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch models");
            }

            setModels(data.models || []);

            // Auto-select first model if none selected
            if (data.models?.length > 0 && !config.model) {
                onChange({ ...config, model: data.models[0].id });
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setModelError(errMsg);
        } finally {
            setIsLoadingModels(false);
        }
    }, [canFetchModels, config, onChange]);

    // Auto-fetch models on mount if applicable
    useEffect(() => {
        if (canFetchModels && config.baseUrl) {
            fetchModels();
        }
        // Only run on mount / provider change — not on every config change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.provider]);

    const handleProviderChange = (provider: LLMProviderType) => {
        const defaults = DEFAULT_CONFIGS[provider];
        // Preserve API key across providers that need one
        const needsKey = PROVIDER_INFO[provider].needsApiKey;
        onChange({
            ...defaults,
            apiKey: needsKey ? config.apiKey : undefined,
        });
        setModels([]);
        setModelError(null);
        setTestResult(null);
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);

        try {
            const response = await fetch("/api/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ llmConfig: config }),
            });
            const data = await response.json();

            if (data.success) {
                setTestResult({ success: true, message: data.message });
            } else {
                setTestResult({
                    success: false,
                    message: data.error || "Connection failed",
                });
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setTestResult({ success: false, message: errMsg });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = () => {
        saveSettings(config);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const handleSaveAndClose = () => {
        saveSettings(config);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content settings-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2>⚙️ LLM Settings</h2>
                    <button className="modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="settings-form">
                    {/* Provider Selection */}
                    <div className="form-group">
                        <label>Provider</label>
                        <div className="provider-buttons">
                            {PROVIDER_ORDER.map((p) => {
                                const info = PROVIDER_INFO[p];
                                return (
                                    <button
                                        key={p}
                                        className={`provider-btn ${config.provider === p ? "active" : ""}`}
                                        onClick={() => handleProviderChange(p)}
                                    >
                                        <span className="provider-icon">{info.icon}</span>
                                        <span className="provider-label">{info.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Provider Description */}
                    <div className="settings-info">
                        <p>
                            {providerInfo.icon} {providerInfo.description}
                        </p>
                    </div>

                    {/* Base URL */}
                    <div className="form-group">
                        <label>Base URL</label>
                        <input
                            type="text"
                            value={config.baseUrl}
                            onChange={(e) =>
                                onChange({ ...config, baseUrl: e.target.value })
                            }
                            placeholder={DEFAULT_CONFIGS[config.provider]?.baseUrl || "http://localhost:1234"}
                        />
                    </div>

                    {/* API Key (for providers that need it) */}
                    {providerInfo.needsApiKey && (
                        <div className="form-group">
                            <label>API Key</label>
                            <input
                                type="password"
                                value={config.apiKey || ""}
                                onChange={(e) =>
                                    onChange({ ...config, apiKey: e.target.value })
                                }
                                placeholder={
                                    config.provider === "openai"
                                        ? "sk-..."
                                        : config.provider === "gemini"
                                            ? "AIza..."
                                            : "sk-ant-..."
                                }
                            />
                        </div>
                    )}

                    {/* Model Selection */}
                    <div className="form-group">
                        <label>
                            Model
                            {canFetchModels && (
                                <button
                                    className="btn-inline"
                                    onClick={fetchModels}
                                    disabled={isLoadingModels}
                                >
                                    {isLoadingModels ? "⏳ Loading..." : "🔄 Refresh"}
                                </button>
                            )}
                        </label>

                        {/* Dropdown for providers that support model listing */}
                        {canFetchModels && models.length > 0 ? (
                            <select
                                className="model-select"
                                title="Select a model"
                                value={config.model}
                                onChange={(e) =>
                                    onChange({ ...config, model: e.target.value })
                                }
                            >
                                <option value="">Select a model...</option>
                                {models.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                        {m.state ? ` (${m.state})` : ""}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={config.model}
                                onChange={(e) =>
                                    onChange({ ...config, model: e.target.value })
                                }
                                placeholder={DEFAULT_CONFIGS[config.provider]?.model || "model-name"}
                            />
                        )}

                        {modelError && (
                            <div className="field-error">⚠️ {modelError}</div>
                        )}
                    </div>

                    {/* Test Connection + Save */}
                    <div className="settings-actions">
                        <button
                            className="btn btn-test"
                            onClick={handleTestConnection}
                            disabled={isTesting || !config.model}
                        >
                            {isTesting ? (
                                <>
                                    <span className="spinner" /> Testing...
                                </>
                            ) : (
                                "🔌 Test Connection"
                            )}
                        </button>
                        <button
                            className="btn btn-save"
                            onClick={handleSave}
                        >
                            {isSaved ? "✅ Saved!" : "💾 Save"}
                        </button>
                        <button
                            className="btn btn-save-close"
                            onClick={handleSaveAndClose}
                        >
                            Save & Close
                        </button>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div
                            className={`test-result ${testResult.success ? "success" : "error"}`}
                        >
                            {testResult.success ? "✅" : "❌"} {testResult.message}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
