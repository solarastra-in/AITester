import React, { useState } from 'react';
import {
  BookOpen,
  Terminal,
  Code2,
  Container,
  Layers,
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  Shield,
  FileJson,
  Cpu,
  Zap,
} from 'lucide-react';

interface DocsViewProps {
  onStartStudio: () => void;
  onOpenContact: () => void;
}

export const DocsView: React.FC<DocsViewProps> = ({ onStartStudio, onOpenContact }) => {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const DOCKER_CLI_CODE = `# 1. Pull or build the self-contained Verity package
docker build -t verity-test-suite .

# 2. Execute tests against production with zero-gap variables
docker run --rm \\
  -e TARGET_URL="https://ai.whyor.in" \\
  -e ENVIRONMENT="production" \\
  verity-test-suite

# 3. Output results: exit code 0 indicates 100% test pass`;

  const GITHUB_ACTIONS_CODE = `name: Verity QA Automated Regression Suite

on:
  push:
    branches: [ main, staging ]
  pull_request:
    branches: [ main ]

jobs:
  verity-regression:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run Verity Standalone Docker Suite
        run: |
          docker run --rm \\
            -e TARGET_URL="https://ai.whyor.in" \\
            -e ENVIRONMENT="staging" \\
            -e RUNNER_MODE="headless" \\
            ghcr.io/my-org/verity-qa-runner:latest
`;

  const JSON_SPEC_SAMPLE = `{
  "id": "tc_why_01",
  "extId": "WHYO-001",
  "category": "SEO & Crawl Architecture",
  "title": "Verify XML Sitemap and robots.txt indexing directives",
  "priority": "High",
  "tags": ["seo", "sitemap", "smoke"],
  "type": "http",
  "spec": {
    "requests": [
      {
        "name": "Fetch XML Sitemap",
        "method": "GET",
        "path": "/sitemap.xml",
        "headers": {
          "Accept": "application/xml"
        }
      }
    ],
    "expect": {
      "statusIn": [200],
      "bodyContains": ["urlset", "sitemap", "whyor.in"]
    }
  },
  "dataFields": ["baseUrl"]
}`;

  return (
    <div className="relative min-h-screen bg-[#07080D] text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 right-1/4 w-[700px] h-[350px] bg-teal-500/10 blur-[140px] rounded-full" />
        <div className="absolute top-1/2 -right-40 w-[450px] h-[450px] bg-emerald-500/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Breadcrumb Navigation for SEO */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-400">
          <a href="/" className="hover:text-emerald-400 transition">Verity QA Platform</a>
          <span>/</span>
          <span className="text-emerald-400 font-semibold">Developer Documentation & API Spec</span>
        </nav>

        {/* Header Hero */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 mb-4">
            <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
            <span>Developer Reference & QA Automation Guide</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            Verity Platform Documentation
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Everything you need to configure live network introspection, manage parameterized datasets with zero dummy data, and run standalone Docker packages.
          </p>
        </div>

        {/* Quick Links Nav */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
          <a
            href="#quickstart"
            className="rounded-xl border border-[#1E2235] bg-[#0C0E17]/80 p-3 text-center text-xs font-semibold text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 transition"
          >
            1. Quick Start Guide
          </a>
          <a
            href="#schema"
            className="rounded-xl border border-[#1E2235] bg-[#0C0E17]/80 p-3 text-center text-xs font-semibold text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 transition"
          >
            2. Test Spec Schema
          </a>
          <a
            href="#docker"
            className="rounded-xl border border-[#1E2235] bg-[#0C0E17]/80 p-3 text-center text-xs font-semibold text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 transition"
          >
            3. Docker Packaging
          </a>
          <a
            href="#cicd"
            className="rounded-xl border border-[#1E2235] bg-[#0C0E17]/80 p-3 text-center text-xs font-semibold text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 transition"
          >
            4. CI/CD Pipelines
          </a>
        </div>

        {/* Section 1: Quick Start */}
        <div id="quickstart" className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 sm:p-8 shadow-xl mb-12">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-400" />
            <span>1. Quick Start: URL Introspection to Running Suite in 60 Seconds</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mb-6">
            Follow this 3-step workflow to generate a high-fidelity automated test suite for any web app or API:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-5">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold mb-2">
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20">STEP 01</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-2">Launch URL Introspection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Click <strong>Guided Journey</strong> in Interactive Studio and input your target origin (e.g. <code className="text-emerald-300">https://ai.whyor.in</code>). Verity probes the host for response headers, SSL certificates, sitemaps, and framework signatures.
              </p>
            </div>

            <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-5">
              <div className="flex items-center gap-2 text-teal-400 font-mono text-xs font-bold mb-2">
                <span className="rounded bg-teal-500/10 px-2 py-0.5 border border-teal-500/20">STEP 02</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-2">Answer Context Questions</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Verity detects whether your application is an SPA, REST API, or AI router, and asks targeted questions about authentication personas, sensitive headers, and key endpoints.
              </p>
            </div>

            <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-5">
              <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold mb-2">
                <span className="rounded bg-cyan-500/10 px-2 py-0.5 border border-cyan-500/20">STEP 03</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-2">Execute & Export</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Run tests instantly in the preview environment or click <strong>Download Standalone Docker Package</strong> to execute offline inside your own VPC or CI/CD pipelines.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Test Case Spec Schema */}
        <div id="schema" className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 sm:p-8 shadow-xl mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileJson className="h-5 w-5 text-emerald-400" />
                <span>2. Verity Specification Schema (HTTP & Load)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Standardized JSON schema representing functional endpoints, dynamic template tokens, and status assertions.
              </p>
            </div>
            <button
              onClick={() => handleCopy(JSON_SPEC_SAMPLE, 'spec')}
              className="flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1A1D2B] transition"
            >
              {copiedSnippet === 'spec' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
          </div>

          <pre className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
            {JSON_SPEC_SAMPLE}
          </pre>
        </div>

        {/* Section 3: Docker Packaging */}
        <div id="docker" className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 sm:p-8 shadow-xl mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Container className="h-5 w-5 text-emerald-400" />
                <span>3. Self-Contained Docker Execution</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Every exported package contains an automated runner script, complete suite JSON, and a multi-stage Dockerfile.
              </p>
            </div>
            <button
              onClick={() => handleCopy(DOCKER_CLI_CODE, 'docker')}
              className="flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1A1D2B] transition"
            >
              {copiedSnippet === 'docker' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Commands</span>
                </>
              )}
            </button>
          </div>

          <pre className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
            {DOCKER_CLI_CODE}
          </pre>
        </div>

        {/* Section 4: CI/CD Pipeline Automation */}
        <div id="cicd" className="rounded-2xl border border-[#1E2235] bg-[#0C0E17]/90 p-6 sm:p-8 shadow-xl mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Terminal className="h-5 w-5 text-emerald-400" />
                <span>4. CI/CD Pipeline Integration (GitHub Actions)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enforce zero-regression gates on pull requests with standard exit code reporting.
              </p>
            </div>
            <button
              onClick={() => handleCopy(GITHUB_ACTIONS_CODE, 'gh')}
              className="flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1A1D2B] transition"
            >
              {copiedSnippet === 'gh' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Workflow</span>
                </>
              )}
            </button>
          </div>

          <pre className="rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
            {GITHUB_ACTIONS_CODE}
          </pre>
        </div>

        {/* Call to action */}
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-white">Need Custom Integration or Protocol Assistance?</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Our engineering team helps organizations integrate complex auth architectures, WebSocket pipelines, and gRPC endpoints.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenContact}
              className="rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B] transition"
            >
              Contact Solutions Team
            </button>
            <button
              onClick={onStartStudio}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Launch Studio</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
