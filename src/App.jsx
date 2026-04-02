import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const PROMPT = `You are an expert art instructor specializing in perspective theory and technical drawing with 20+ years of experience teaching artists at all levels.

Analyze this artwork image across five perspective categories. Before scoring, examine the artwork holistically and infer the artist's skill level:

BEGINNER signals: shaky/inconsistent line quality, no clear perspective system, basic subjects, errors suggest unfamiliarity with rules.
INTERMEDIATE signals: clear attempt at perspective but inconsistent execution, some areas correct others breaking down, errors suggest knowing rules but losing track.
ADVANCED signals: confident line quality, complex compositions, subtle errors, work suggests deep knowledge of rules.

Calibrate your entire response tone based on inferred skill level:
- BEGINNER: plain English, lead with what is working, simple fixes, warm and encouraging
- INTERMEDIATE: some technical language, direct about issues, honest and constructive
- ADVANCED: full technical vocabulary, peer-to-peer, clinical, no hand-holding

Now score these five categories:
1. HORIZON LINE CONSISTENCY - Is there a clear implied horizon? Does it stay consistent across all objects?
2. VANISHING POINT ACCURACY - Do receding lines converge correctly? Are perspective systems applied consistently?
3. OBJECT SCALE RELATIONSHIPS - Are objects sized correctly relative to their depth? Do figures scale appropriately?
4. FORESHORTENING - Are angled objects/figures compressed correctly? Do ellipses follow correct rules relative to horizon?
5. ATMOSPHERIC DEPTH - Do value shifts, edge softness, and saturation loss reinforce depth?

Return ONLY a JSON object. No preamble, no markdown, no explanation outside the JSON:

{
  "overall_score": <0-100>,
  "inferred_skill_level": "beginner" or "intermediate" or "advanced",
  "skill_inference_reasoning": "<one sentence explaining what visual evidence led to this inference>",
  "overall_summary": "<2-3 sentences calibrated to inferred skill level>",
  "categories": [
    {
      "name": "Horizon Line Consistency",
      "score": <0-100 or null if cannot be assessed>,
      "observation": "<specific to THIS image>",
      "fix": "<specific actionable correction for THIS image>"
    },
    {
      "name": "Vanishing Point Accuracy",
      "score": <0-100 or null>,
      "observation": "<specific to THIS image>",
      "fix": "<specific actionable correction for THIS image>"
    },
    {
      "name": "Object Scale Relationships",
      "score": <0-100 or null>,
      "observation": "<specific to THIS image>",
      "fix": "<specific actionable correction for THIS image>"
    },
    {
      "name": "Foreshortening",
      "score": <0-100 or null>,
      "observation": "<specific to THIS image>",
      "fix": "<specific actionable correction for THIS image>"
    },
    {
      "name": "Atmospheric Depth",
      "score": <0-100 or null>,
      "observation": "<specific to THIS image>",
      "fix": "<specific actionable correction for THIS image>"
    }
  ]
}

Critical rules:
- Every observation and fix must reference something specific in THIS image
- Scores should be honest and differentiated — avoid clustering everything between 70-80
- If a category cannot be assessed, set score to null and explain in observation
- Overall score is a weighted average with Vanishing Point Accuracy and Horizon Line Consistency weighted most heavily`;

function getScoreColor(score) {
  if (score === null) return { bg: "#EEEDFE", text: "#3C3489", bar: "#7F77DD", badge: "#CECBF6" };
  if (score >= 80) return { bg: "#EEEDFE", text: "#3C3489", bar: "#7F77DD", badge: "#CECBF6" };
  if (score >= 60) return { bg: "#FAECE7", text: "#712B13", bar: "#D85A30", badge: "#F5C4B3" };
  return { bg: "#FEE2E2", text: "#991B1B", bar: "#EF4444", badge: "#FECACA" };
}

function getSkillColors(level) {
  if (level === "beginner") return { bg: "#FAECE7", text: "#712B13" };
  if (level === "advanced") return { bg: "#EEEDFE", text: "#3C3489" };
  return { bg: "#F5C4B3", text: "#993C1D" };
}

const LOADING_MESSAGES = [
  "Analyzing your perspective...",
  "Checking vanishing points...",
  "Measuring horizon consistency...",
  "Calibrating your score...",
  "Assessing atmospheric depth...",
];

export default function App() {
  const [stage, setStage] = useState("upload");
  const [preview, setPreview] = useState(null);
  const [base64, setBase64] = useState(null);
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [dragOver, setDragOver] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loadingShared, setLoadingShared] = useState(false);
  const fileInputRef = useRef(null);
  const loadingRef = useRef(null);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/result\/([a-f0-9-]+)/);
    if (match) {
      loadSharedResult(match[1]);
    }
  }, []);

  const loadSharedResult = async (id) => {
    setLoadingShared(true);
    try {
      const { data, error } = await supabase
        .from("analyses")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      if (data) {
        setResults({
          overall_score: data.overall_score,
          inferred_skill_level: data.inferred_skill_level,
          skill_inference_reasoning: data.skill_inference_reasoning,
          overall_summary: data.overall_summary,
          categories: data.categories,
        });
        if (data.image_url) setPreview(data.image_url);
        setStage("results");
        setShareUrl(window.location.href);
      }
    } catch (err) {
      setError("Could not load shared result.");
      setStage("upload");
    }
    setLoadingShared(false);
  };

  const saveAndGenerateLink = async (analysisResults, imageBase64) => {
    try {
      let imageUrl = null;
      const fileName = `${Date.now()}.jpg`;
      const byteCharacters = atob(imageBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/jpeg" });

      const { data: uploadData } = await supabase.storage
        .from("drawings")
        .upload(fileName, blob, { contentType: "image/jpeg" });

      if (uploadData) {
        const { data: urlData } = supabase.storage
          .from("drawings")
          .getPublicUrl(fileName);
        imageUrl = urlData?.publicUrl || null;
      }

      const { data, error } = await supabase
        .from("analyses")
        .insert({
          overall_score: analysisResults.overall_score,
          inferred_skill_level: analysisResults.inferred_skill_level,
          skill_inference_reasoning: analysisResults.skill_inference_reasoning,
          overall_summary: analysisResults.overall_summary,
          categories: analysisResults.categories,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;
      const url = `${window.location.origin}/result/${data.id}`;
      setShareUrl(url);
    } catch (err) {
      console.error("Could not save result:", err);
    }
  };

  const handleFile = useCallback((file) => {
    setError(null);
    const valid = ["image/jpeg", "image/png", "image/webp"];
    if (!valid.includes(file.type)) {
      setError("Please upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Please upload an image under 5MB.");
      return;
    }
    setMediaType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setBase64(e.target.result.split(",")[1]);
      setStage("preview");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!base64) return;
    setError(null);
    setShareUrl(null);
    setStage("loading");

    let idx = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    loadingRef.current = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[idx]);
    }, 1800);

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: PROMPT },
            ],
          }],
        }),
      });

      clearInterval(loadingRef.current);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "API error");

      const text = data.content.map((b) => b.text || "").join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResults(parsed);
      setStage("results");
      await saveAndGenerateLink(parsed, base64);

    } catch (err) {
      clearInterval(loadingRef.current);
      setError("Analysis failed — please try again. " + (err.message || ""));
      setStage("preview");
    }
  };

  const copyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const reset = () => {
    setStage("upload");
    setPreview(null);
    setBase64(null);
    setResults(null);
    setError(null);
    setShareUrl(null);
    setCopied(false);
    window.history.pushState({}, "", "/");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (loadingShared) {
    return (
      <div style={{ minHeight: "100vh", background: "#FDF0EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: "2px solid #E5E7EB", borderTopColor: "#D85A30", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, color: "#993C1D", fontFamily: "system-ui, sans-serif" }}>Loading shared result...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" }}>
      <div style={{ background: "#F8D5C5", padding: "2.5rem 1.5rem 3rem", textAlign: "center" }}>
          <div style={{
            display: "inline-block", fontSize: 11, fontFamily: "monospace",
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#A85A48", marginBottom: 16, padding: "4px 14px",
            border: "0.5px solid #E8B8A0", borderRadius: 20,
          }}>
            A spell-checker for perspective
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 400, color: "#5B4A45", marginBottom: 10, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            Perspective<br />Confidence Score
          </h1>
          <p style={{ fontSize: 15, color: "#7D6A5E", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
            Upload your drawing and get an instant AI-powered<br />perspective report card — calibrated to your skill level.
          </p>
      </div>
      <div style={{ flex: 1, background: "#FAFAFA", padding: "0 1.5rem" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 0 4rem", marginTop: "48px" }}>

        {stage === "upload" && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `1.5px dashed ${dragOver ? "#D85A30" : "#F5C4B3"}`,
                borderRadius: 16, padding: "4rem 2rem", textAlign: "center",
                cursor: "pointer", background: dragOver ? "#FAECE7" : "transparent",
                transition: "all 0.2s", marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>⬆</div>
              <p style={{ fontSize: 15, color: "#712B13", fontFamily: "system-ui, sans-serif", marginBottom: 6 }}>
                Drop your drawing here or click to upload
              </p>
              <span style={{ fontSize: 12, color: "#D85A30", fontFamily: "system-ui, sans-serif" }}>
                JPG, PNG or WEBP — max 5MB
              </span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }} onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
            {error && <ErrorMsg msg={error} />}
          </>
        )}

        {stage === "preview" && (
          <>
            <div style={{ borderRadius: 16, overflow: "hidden", border: "0.5px solid #F5C4B3", marginBottom: 16, position: "relative" }}>
              <img src={preview} alt="Your drawing" style={{ width: "100%", maxHeight: 380, objectFit: "contain", display: "block", background: "#FAECE7" }} />
              <button onClick={reset} style={{
                position: "absolute", top: 12, right: 12, fontSize: 12,
                fontFamily: "system-ui, sans-serif", padding: "4px 12px",
                background: "#FFFAF8", border: "0.5px solid #F5C4B3",
                borderRadius: 20, cursor: "pointer", color: "#712B13",
              }}>Change image</button>
            </div>
            {error && <ErrorMsg msg={error} />}
            <button onClick={analyze} style={{
              width: "100%", padding: "14px", fontSize: 15,
              fontFamily: "system-ui, sans-serif", fontWeight: 500,
              background: "#D85A30", color: "white", border: "none",
              borderRadius: 12, cursor: "pointer", letterSpacing: "0.01em",
            }}
              onMouseOver={(e) => e.target.style.opacity = "0.85"}
              onMouseOut={(e) => e.target.style.opacity = "1"}
            >
              Analyze my perspective
            </button>
          </>
        )}

        {stage === "loading" && (
          <div style={{ textAlign: "center", padding: "5rem 1rem" }}>
            <div style={{
              width: 40, height: 40, border: "2px solid #E5E7EB",
              borderTopColor: "#D85A30", borderRadius: "50%",
              animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
            }} />
            <p style={{ fontSize: 14, color: "#993C1D", fontFamily: "system-ui, sans-serif" }}>{loadingMsg}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {stage === "results" && results && (
          <Results
            results={results}
            preview={preview}
            shareUrl={shareUrl}
            copied={copied}
            onCopy={copyLink}
            onReset={reset}
          />
        )}
        </div>
      </div>
      <div style={{ background: "#DAE9E0", padding: "2rem 1.5rem", textAlign: "center", marginTop: "auto" }}>
        <p style={{ fontSize: 12, color: "#4A6B60", fontFamily: "system-ui, sans-serif", margin: 0, opacity: 0.8 }}>Perspective Checker — AI-powered perspective analysis</p>
      </div>
    </div>
  );
}

function ErrorMsg({ msg }) {
  return (
    <div style={{
      background: "#FEE2E2", border: "0.5px solid #FECACA",
      borderRadius: 10, padding: "12px 16px", fontSize: 13,
      fontFamily: "system-ui, sans-serif", color: "#991B1B", marginBottom: 12,
    }}>{msg}</div>
  );
}

function Results({ results, preview, shareUrl, copied, onCopy, onReset }) {
  const overallColors = getScoreColor(results.overall_score);
  const skillColors = getSkillColors(results.inferred_skill_level);
  const skillLabel = results.inferred_skill_level
    ? results.inferred_skill_level.charAt(0).toUpperCase() + results.inferred_skill_level.slice(1)
    : "Unknown";

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span style={{
          display: "inline-block", fontSize: 12, fontWeight: 500,
          fontFamily: "system-ui, sans-serif", padding: "4px 14px",
          borderRadius: 20, background: skillColors.bg, color: skillColors.text,
        }}>
          {skillLabel} artist
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#D85A30", fontFamily: "system-ui, sans-serif", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        {results.skill_inference_reasoning}
      </p>

      <div style={{
        background: "#FFFAF8", border: "0.5px solid #F5C4B3",
        borderRadius: 16, padding: "1.5rem", marginBottom: "1rem",
        display: "flex", gap: "1.5rem", alignItems: "flex-start",
      }}>
        <div style={{
          flexShrink: 0, width: 84, height: 84, borderRadius: "50%",
          background: overallColors.bg, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 26, fontWeight: 400, color: overallColors.text, lineHeight: 1 }}>
            {results.overall_score}
          </span>
          <span style={{ fontSize: 10, color: overallColors.text, opacity: 0.6, marginTop: 2, fontFamily: "system-ui, sans-serif" }}>/100</span>
        </div>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "#26215C", marginBottom: 8, fontFamily: "system-ui, sans-serif" }}>
            Overall Perspective Score
          </h2>
          <p style={{ fontSize: 14, color: "#993C1D", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
            {results.overall_summary}
          </p>
        </div>
      </div>

      {shareUrl && (
        <div style={{
          background: "#EEEDFE", border: "0.5px solid #AFA9EC",
          borderRadius: 12, padding: "12px 16px", marginBottom: "1rem",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ overflow: "hidden" }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "#3C3489", fontFamily: "system-ui, sans-serif", marginBottom: 2 }}>
              Your result has a shareable link
            </p>
            <p style={{ fontSize: 11, color: "#993C1D", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shareUrl}
            </p>
          </div>
          <button onClick={onCopy} style={{
            flexShrink: 0, fontSize: 12, fontFamily: "system-ui, sans-serif",
            padding: "6px 14px", background: copied ? "#534AB7" : "#FFFAF8",
            color: copied ? "white" : "#534AB7",
            border: "0.5px solid #AFA9EC", borderRadius: 20,
            cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
          }}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {results.categories.map((cat) => (
          <CategoryCard key={cat.name} cat={cat} />
        ))}
      </div>

      <button onClick={onReset} style={{
        width: "100%", padding: "12px", fontSize: 14,
        fontFamily: "system-ui, sans-serif", background: "transparent", color: "#712B13",
        border: "0.5px solid #F5C4B3", borderRadius: 12,
        cursor: "pointer", color: "#712B13", marginTop: "1.5rem",
      }}
        onMouseOver={(e) => e.target.style.background = "#FAECE7"}
        onMouseOut={(e) => e.target.style.background = "transparent"}
      >
        Analyze another drawing
      </button>
    </div>
  );
}

function CategoryCard({ cat }) {
  const colors = getScoreColor(cat.score);
  const scoreDisplay = cat.score !== null ? `${cat.score}/100` : "—";
  const barWidth = cat.score !== null ? cat.score : 0;

  return (
    <div style={{
      background: "#FFFAF8", border: "0.5px solid #F5C4B3",
      borderRadius: 14, padding: "1rem 1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#26215C", fontFamily: "system-ui, sans-serif" }}>
          {cat.name}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 500, fontFamily: "system-ui, sans-serif",
          padding: "2px 10px", borderRadius: 20,
          background: colors.badge, color: colors.text,
        }}>
          {scoreDisplay}
        </span>
      </div>
      <div style={{ height: 3, background: "#F5C4B3", borderRadius: 2, marginBottom: 14 }}>
        <div style={{ height: 3, borderRadius: 2, background: colors.bar, width: `${barWidth}%` }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 500, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", color: "#D85A30", minWidth: 80, paddingTop: 2 }}>Observation</span>
        <span style={{ fontSize: 13, color: "#993C1D", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>{cat.observation}</span>
      </div>
      <div style={{ height: "0.5px", background: "#F5C4B3", margin: "8px 0" }} />
      <div style={{ display: "flex", gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 500, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", color: "#D85A30", minWidth: 80, paddingTop: 2 }}>Fix</span>
        <span style={{ fontSize: 13, color: "#26215C", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>{cat.fix}</span>
      </div>
    </div>
  );
}
