import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Brain,
  Wand2,
  Video,
  Image as ImageIcon,
  Smile,
  Radio,
  Mic,
  Music,
  Cloud,
  CloudRain,
  Clock,
  Aperture,
  Sparkles,
} from "lucide-react";
import {
  generativeFill,
  generativeReplace,
  textToImage,
  textToVideo,
  imageToVideo,
  faceRetouch,
  motionTracking,
  speechToText,
  aiVoiceover,
  beatSync,
  skyReplace,
  weatherEffects,
  timeRemap,
  stabilize,
  MEDIA_AI_TOOLS,
} from "@/lib/media/media-ai";

export const Route = createFileRoute("/ai-media")({
  head: () => ({
    meta: [
      { title: "AI Media Tools — Infinite Loop Sound" },
      {
        name: "description",
        content:
          "AI-powered media tools: generative fill, text-to-image/video, face retouch, motion tracking, voiceover, and more.",
      },
    ],
  }),
  component: AIMediaPage,
});

function AIMediaPage() {
  const [status, setStatus] = useState<string>("Ready.");
  const [running, setRunning] = useState(false);

  // Generative Fill
  const [fillDir, setFillDir] = useState("all");
  const [fillDist, setFillDist] = useState(100);

  // Generative Replace
  const [replaceArea, setReplaceArea] = useState("");
  const [replaceDesc, setReplaceDesc] = useState("");

  // Text-to-Image
  const [t2iPrompt, setT2iPrompt] = useState("");
  const [t2iWidth, setT2iWidth] = useState(1024);
  const [t2iHeight, setT2iHeight] = useState(1024);

  // Text-to-Video
  const [t2vPrompt, setT2vPrompt] = useState("");
  const [t2vDuration, setT2vDuration] = useState(5);
  const [t2vFps, setT2vFps] = useState(30);

  // Image-to-Video
  const [i2vMotion, setI2vMotion] = useState("zoom");
  const [i2vDuration, setI2vDuration] = useState(5);

  // Face Retouch
  const [skinSmooth, setSkinSmooth] = useState(30);
  const [blemish, setBlemish] = useState(20);
  const [eyeBrighten, setEyeBrighten] = useState(15);
  const [teethWhiten, setTeethWhiten] = useState(10);
  const [naturalLook, setNaturalLook] = useState(true);

  // Motion Tracking
  const [trackTarget, setTrackTarget] = useState("");
  const [trackAttach, setTrackAttach] = useState("text");

  // Speech-to-Text
  const [sttLang, setSttLang] = useState("en");
  const [sttStyle, setSttStyle] = useState("default");

  // Voiceover
  const [voText, setVoText] = useState("");
  const [voVoice, setVoVoice] = useState("narrator");
  const [voLang, setVoLang] = useState("en");

  // Beat Sync
  const [bpm, setBpm] = useState(120);
  const [cutOnBeat, setCutOnBeat] = useState(true);

  // Sky Replace
  const [skyType, setSkyType] = useState("sunset");
  const [adjustReflection, setAdjustReflection] = useState(true);

  // Weather
  const [weatherEffect, setWeatherEffect] = useState("rain");
  const [weatherIntensity, setWeatherIntensity] = useState(50);

  // Time Remap
  const [remapSpeed, setRemapSpeed] = useState(0.5);
  const [remapMode, setRemapMode] = useState("slow-mo");

  // Stabilize
  const [smoothness, setSmoothness] = useState(50);
  const [correctRS, setCorrectRS] = useState(false);

  const simulate = (msg: string) => {
    setRunning(true);
    setStatus("Processing...");
    setTimeout(() => {
      setRunning(false);
      setStatus(msg);
    }, 600);
  };

  const runFill = () => {
    const r = generativeFill(fillDir, fillDist);
    simulate(`Extended ${r.extendedPixels}px ${r.direction}`);
  };
  const runReplace = () => {
    const r = generativeReplace(replaceArea, replaceDesc);
    simulate(`Replace "${r.area}" → "${r.description}" (${r.status})`);
  };
  const runT2I = () => {
    const r = textToImage(t2iPrompt, t2iWidth, t2iHeight);
    simulate(`Image ${r.width}×${r.height} — ${r.status}`);
  };
  const runT2V = () => {
    const r = textToVideo(t2vPrompt, t2vDuration, t2vFps);
    simulate(`Video ${r.duration}s @ ${r.fps}fps — ${r.status}`);
  };
  const runI2V = () => {
    const r = imageToVideo(i2vMotion, i2vDuration);
    simulate(`Motion "${r.motion}" ${r.duration}s — ${r.status}`);
  };
  const runFace = () => {
    const r = faceRetouch({
      skinSmooth,
      blemish,
      eyeBrighten,
      teethWhiten,
      jawline: 0,
      naturalLook,
    });
    simulate(`Face retouch: smooth=${r.skinSmooth} blemish=${r.blemish} eyes=${r.eyeBrighten}`);
  };
  const runTrack = () => {
    const r = motionTracking(trackTarget, trackAttach);
    simulate(`Tracking "${r.target}" → ${r.attachType} (${r.status})`);
  };
  const runSTT = () => {
    const r = speechToText(sttLang, sttStyle);
    simulate(`Transcribed (${r.language}/${r.style}) — ${r.status}`);
  };
  const runVO = () => {
    const r = aiVoiceover(voText, voVoice, voLang);
    simulate(`Voiceover ${r.duration}s (${r.voice}/${r.language}) — ${r.status}`);
  };
  const runBeat = () => {
    const r = beatSync(bpm, cutOnBeat);
    simulate(`Beat sync ${r.bpm} BPM → ${r.cuts} cuts`);
  };
  const runSky = () => {
    const r = skyReplace(skyType, adjustReflection);
    simulate(`Sky → ${r.skyType} (reflection: ${r.adjustReflection}) — ${r.status}`);
  };
  const runWeather = () => {
    const r = weatherEffects(weatherEffect, weatherIntensity);
    simulate(`Weather "${r.effect}" @ ${r.intensity}%`);
  };
  const runRemap = () => {
    const r = timeRemap(remapSpeed, remapMode);
    simulate(`Time remap ${r.speed}× (${r.mode}) interpolated=${r.interpolated}`);
  };
  const runStabilize = () => {
    const r = stabilize(smoothness, correctRS);
    simulate(`Stabilized smoothness=${r.smoothness} RS=${r.correctRollingShutter}`);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="AI Media Tools"
          subtitle="AI-powered editing and generation"
          icon={Brain}
          action={<Badge variant="secondary">{MEDIA_AI_TOOLS.length} AI tools</Badge>}
        />

        <KpiGrid
          tiles={[
            { label: "AI Tools", value: MEDIA_AI_TOOLS.length, icon: Brain },
            { label: "Generative", value: 5, icon: Sparkles },
            { label: "Audio AI", value: 5, icon: Mic },
            { label: "Motion AI", value: 5, icon: Video },
          ]}
        />

        <ProCard title="Status" description="Tool execution status" icon={Radio}>
          <div className="flex items-center gap-3">
            <Badge variant={running ? "default" : "outline"}>
              {running ? "Running..." : "Idle"}
            </Badge>
            <span className="text-sm text-muted-foreground">{status}</span>
          </div>
        </ProCard>

        <ProCard title="Generative Fill" description="Extend image edges with AI" icon={Wand2}>
          <div className="space-y-4">
            <div>
              <Label>Direction</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["left", "right", "up", "down", "all"].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={fillDir === d ? "default" : "outline"}
                    onClick={() => setFillDir(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Distance: {fillDist}px</Label>
              <Slider
                value={[fillDist]}
                min={0}
                max={500}
                step={10}
                onValueChange={(v) => setFillDist(v[0])}
                className="mt-2"
              />
            </div>
            <Button onClick={runFill} disabled={running}>
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Fill
            </Button>
          </div>
        </ProCard>

        <ProCard title="Generative Replace" description="Replace objects via text" icon={Wand2}>
          <div className="space-y-4">
            <div>
              <Label>Area</Label>
              <Input
                value={replaceArea}
                onChange={(e) => setReplaceArea(e.target.value)}
                placeholder="e.g. left selection"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={replaceDesc}
                onChange={(e) => setReplaceDesc(e.target.value)}
                placeholder="Describe replacement..."
                className="mt-2"
              />
            </div>
            <Button onClick={runReplace} disabled={running}>
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Replace
            </Button>
          </div>
        </ProCard>

        <ProCard title="Text to Image" description="Generate images from prompts" icon={ImageIcon}>
          <div className="space-y-4">
            <div>
              <Label>Prompt</Label>
              <Textarea
                value={t2iPrompt}
                onChange={(e) => setT2iPrompt(e.target.value)}
                placeholder="Describe the image..."
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Width: {t2iWidth}</Label>
                <Slider
                  value={[t2iWidth]}
                  min={256}
                  max={2048}
                  step={64}
                  onValueChange={(v) => setT2iWidth(v[0])}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Height: {t2iHeight}</Label>
                <Slider
                  value={[t2iHeight]}
                  min={256}
                  max={2048}
                  step={64}
                  onValueChange={(v) => setT2iHeight(v[0])}
                  className="mt-2"
                />
              </div>
            </div>
            <Button onClick={runT2I} disabled={running}>
              <ImageIcon className="w-4 h-4 mr-2" />
              Generate Image
            </Button>
          </div>
        </ProCard>

        <ProCard title="Text to Video" description="Generate video from text" icon={Video}>
          <div className="space-y-4">
            <div>
              <Label>Prompt</Label>
              <Textarea
                value={t2vPrompt}
                onChange={(e) => setT2vPrompt(e.target.value)}
                placeholder="Describe the video..."
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duration: {t2vDuration}s</Label>
                <Slider
                  value={[t2vDuration]}
                  min={1}
                  max={30}
                  step={1}
                  onValueChange={(v) => setT2vDuration(v[0])}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>FPS: {t2vFps}</Label>
                <Slider
                  value={[t2vFps]}
                  min={1}
                  max={60}
                  step={1}
                  onValueChange={(v) => setT2vFps(v[0])}
                  className="mt-2"
                />
              </div>
            </div>
            <Button onClick={runT2V} disabled={running}>
              <Video className="w-4 h-4 mr-2" />
              Generate Video
            </Button>
          </div>
        </ProCard>

        <ProCard title="Image to Video" description="Animate stills with motion" icon={Video}>
          <div className="space-y-4">
            <div>
              <Label>Motion</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["dolly", "pan", "zoom", "orbit"].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={i2vMotion === m ? "default" : "outline"}
                    onClick={() => setI2vMotion(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Duration: {i2vDuration}s</Label>
              <Slider
                value={[i2vDuration]}
                min={1}
                max={30}
                step={1}
                onValueChange={(v) => setI2vDuration(v[0])}
                className="mt-2"
              />
            </div>
            <Button onClick={runI2V} disabled={running}>
              <Video className="w-4 h-4 mr-2" />
              Animate
            </Button>
          </div>
        </ProCard>

        <ProCard title="Face Retouch" description="AI portrait enhancement" icon={Smile}>
          <div className="space-y-4">
            {[
              { label: "Skin Smooth", val: skinSmooth, set: setSkinSmooth },
              { label: "Blemish", val: blemish, set: setBlemish },
              { label: "Eye Brighten", val: eyeBrighten, set: setEyeBrighten },
              { label: "Teeth Whiten", val: teethWhiten, set: setTeethWhiten },
            ].map((s) => (
              <div key={s.label}>
                <Label>
                  {s.label}: {s.val}
                </Label>
                <Slider
                  value={[s.val]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => s.set(v[0])}
                  className="mt-2"
                />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={naturalLook}
                onChange={(e) => setNaturalLook(e.target.checked)}
              />{" "}
              Natural look
            </label>
            <Button onClick={runFace} disabled={running}>
              <Smile className="w-4 h-4 mr-2" />
              Apply Retouch
            </Button>
          </div>
        </ProCard>

        <ProCard title="Motion Tracking" description="Track and attach elements" icon={Radio}>
          <div className="space-y-4">
            <div>
              <Label>Target</Label>
              <Input
                value={trackTarget}
                onChange={(e) => setTrackTarget(e.target.value)}
                placeholder="e.g. person"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Attach</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["text", "graphic", "effect"].map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={trackAttach === a ? "default" : "outline"}
                    onClick={() => setTrackAttach(a)}
                  >
                    {a}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={runTrack} disabled={running}>
              <Radio className="w-4 h-4 mr-2" />
              Track Motion
            </Button>
          </div>
        </ProCard>

        <ProCard title="Speech to Text" description="Transcribe and caption" icon={Mic}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Language</Label>
                <Input
                  value={sttLang}
                  onChange={(e) => setSttLang(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Style</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["default", "karaoke", "animated"].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={sttStyle === s ? "default" : "outline"}
                      onClick={() => setSttStyle(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <Button onClick={runSTT} disabled={running}>
              <Mic className="w-4 h-4 mr-2" />
              Transcribe
            </Button>
          </div>
        </ProCard>

        <ProCard title="AI Voiceover" description="Generate narration" icon={Mic}>
          <div className="space-y-4">
            <div>
              <Label>Text</Label>
              <Textarea
                value={voText}
                onChange={(e) => setVoText(e.target.value)}
                placeholder="Enter narration text..."
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voice</Label>
                <Input
                  value={voVoice}
                  onChange={(e) => setVoVoice(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Language</Label>
                <Input
                  value={voLang}
                  onChange={(e) => setVoLang(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
            <Button onClick={runVO} disabled={running}>
              <Mic className="w-4 h-4 mr-2" />
              Generate Voiceover
            </Button>
          </div>
        </ProCard>

        <ProCard title="Beat Sync" description="Cut video to music" icon={Music}>
          <div className="space-y-4">
            <div>
              <Label>BPM: {bpm}</Label>
              <Slider
                value={[bpm]}
                min={40}
                max={240}
                step={1}
                onValueChange={(v) => setBpm(v[0])}
                className="mt-2"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cutOnBeat}
                onChange={(e) => setCutOnBeat(e.target.checked)}
              />{" "}
              Cut on beat
            </label>
            <Button onClick={runBeat} disabled={running}>
              <Music className="w-4 h-4 mr-2" />
              Sync Beats
            </Button>
          </div>
        </ProCard>

        <ProCard title="Sky Replace" description="Replace skies with presets" icon={Cloud}>
          <div className="space-y-4">
            <div>
              <Label>Sky Type</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["sunset", "aurora", "storm", "galaxy", "clear"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={skyType === s ? "default" : "outline"}
                    onClick={() => setSkyType(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={adjustReflection}
                onChange={(e) => setAdjustReflection(e.target.checked)}
              />{" "}
              Adjust reflection
            </label>
            <Button onClick={runSky} disabled={running}>
              <Cloud className="w-4 h-4 mr-2" />
              Replace Sky
            </Button>
          </div>
        </ProCard>

        <ProCard
          title="Weather Effects"
          description="Add rain, snow, fog, and flares"
          icon={CloudRain}
        >
          <div className="space-y-4">
            <div>
              <Label>Effect</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["rain", "snow", "fog", "sun-rays", "lens-flares"].map((w) => (
                  <Button
                    key={w}
                    size="sm"
                    variant={weatherEffect === w ? "default" : "outline"}
                    onClick={() => setWeatherEffect(w)}
                  >
                    {w}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Intensity: {weatherIntensity}%</Label>
              <Slider
                value={[weatherIntensity]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setWeatherIntensity(v[0])}
                className="mt-2"
              />
            </div>
            <Button onClick={runWeather} disabled={running}>
              <CloudRain className="w-4 h-4 mr-2" />
              Add Weather
            </Button>
          </div>
        </ProCard>

        <ProCard title="Time Remap" description="Speed ramp and slow motion" icon={Clock}>
          <div className="space-y-4">
            <div>
              <Label>Speed: {remapSpeed}×</Label>
              <Slider
                value={[Math.round(remapSpeed * 100)]}
                min={5}
                max={1000}
                step={5}
                onValueChange={(v) => setRemapSpeed(v[0] / 100)}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Mode</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["speed-ramp", "slow-mo", "reverse", "freeze", "optical-flow"].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={remapMode === m ? "default" : "outline"}
                    onClick={() => setRemapMode(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={runRemap} disabled={running}>
              <Clock className="w-4 h-4 mr-2" />
              Remap Time
            </Button>
          </div>
        </ProCard>

        <ProCard title="Stabilize" description="Stabilize shaky footage" icon={Aperture}>
          <div className="space-y-4">
            <div>
              <Label>Smoothness: {smoothness}</Label>
              <Slider
                value={[smoothness]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setSmoothness(v[0])}
                className="mt-2"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={correctRS}
                onChange={(e) => setCorrectRS(e.target.checked)}
              />{" "}
              Correct rolling shutter
            </label>
            <Button onClick={runStabilize} disabled={running}>
              <Aperture className="w-4 h-4 mr-2" />
              Stabilize
            </Button>
          </div>
        </ProCard>
      </div>
    </AppShell>
  );
}
