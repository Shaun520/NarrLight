-- 叙光 (NarrLight) - 插画资产与源实体关联
-- 目的: 支持线索卡通过 source_type='clue' + source_id=clues.id 关联插画任务

CREATE TABLE IF NOT EXISTS public.illustration_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('cover','scene','clue','public','char','poster')),
  title VARCHAR(200) NOT NULL,
  sub TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('done','active','pending')),
  thumb TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  current_version_id UUID DEFAULT NULL,
  source_type VARCHAR(30) DEFAULT NULL,
  source_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.illustration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.illustration_assets(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  model VARCHAR(50) NOT NULL DEFAULT '',
  seed INTEGER NOT NULL DEFAULT 0,
  params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.illustration_assets
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT NULL;

ALTER TABLE public.illustration_assets
  ADD COLUMN IF NOT EXISTS source_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_illustration_assets_script ON public.illustration_assets(script_id);
CREATE INDEX IF NOT EXISTS idx_illustration_assets_type ON public.illustration_assets(type);
CREATE INDEX IF NOT EXISTS idx_illustration_assets_source ON public.illustration_assets(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_illustration_assets_unique_source
  ON public.illustration_assets(script_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_illustration_versions_asset ON public.illustration_versions(asset_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'illustration_assets_current_version_id_fkey'
  ) THEN
    ALTER TABLE public.illustration_assets
      ADD CONSTRAINT illustration_assets_current_version_id_fkey
      FOREIGN KEY (current_version_id)
      REFERENCES public.illustration_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'illustration-assets',
  'illustration-assets',
  TRUE,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.illustration_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.illustration_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "作者可管理自己剧本的插画资产" ON public.illustration_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = illustration_assets.script_id AND scripts.author_id = auth.uid())
  );

CREATE POLICY "作者可管理自己剧本的插画版本" ON public.illustration_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.illustration_assets ia
      JOIN public.scripts s ON s.id = ia.script_id
      WHERE ia.id = illustration_versions.asset_id AND s.author_id = auth.uid()
    )
  );

CREATE TRIGGER update_illustration_assets_updated_at BEFORE UPDATE ON public.illustration_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
