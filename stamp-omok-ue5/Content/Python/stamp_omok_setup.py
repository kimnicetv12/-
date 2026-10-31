"""도장오목 에디터 셋업 — 원본 텍스처·소리를 가져오고, 머티리얼과 맵을 만든다.

언리얼 에디터 안에서 실행한다.
  · 자동: 에디터를 처음 열면 init_unreal.py 가 없는 에셋만 만든다.
  · 수동: 툴 > Python 스크립트 실행 > 이 파일, 또는 출력 로그(Python)에서
        import stamp_omok_setup; stamp_omok_setup.run(force=True)

만드는 것 (/Game/StampOmok)
  Textures/  T_Hanji_D·N, T_Maru_D·N, T_Seal_{Shu,Ai}_{0..2}, T_Mask_*
  Audio/     SFX_*, AMB_Maru(반복), MUS_Gayageum(반복)
  Materials/ M_Hanji, M_Maru, M_Wood, M_Brass, M_Lacquer, M_Acrylic, M_Overlay, MD_Ink
  Maps/      StampOmok (빈 맵: 조명·판·카메라는 C++ 게임 모드가 만든다)
"""
import os

import unreal

ROOT = "/Game/StampOmok"
TEX_DIR = f"{ROOT}/Textures"
AUD_DIR = f"{ROOT}/Audio"
MAT_DIR = f"{ROOT}/Materials"
MAP_PATH = f"{ROOT}/Maps/StampOmok"

AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary


def log(msg):
    unreal.log(f"[StampOmok] {msg}")


def project_dir():
    return unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())


def exists(path):
    return EAL.does_asset_exist(path)


# ───────────────────────────── 가져오기 ─────────────────────────────
def import_file(src, dest_dir, name):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", src)
    task.set_editor_property("destination_path", dest_dir)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)
    AT.import_asset_tasks([task])
    return EAL.load_asset(f"{dest_dir}/{name}")


def configure_texture(tex, name):
    if name.endswith("_N"):
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        tex.set_editor_property("srgb", False)
    elif name.startswith("T_Seal_") or name.startswith("T_Mask_"):
        # 한 채널 마스크: 선형 회색조, 가장자리 번짐 없이
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_GRAYSCALE)
        tex.set_editor_property("srgb", False)
        tex.set_editor_property("address_x", unreal.TextureAddress.TA_CLAMP)
        tex.set_editor_property("address_y", unreal.TextureAddress.TA_CLAMP)
    else:
        tex.set_editor_property("srgb", True)
    EAL.save_loaded_asset(tex)


def import_textures(force):
    src_dir = os.path.join(project_dir(), "SourceArt", "Textures")
    for file in sorted(os.listdir(src_dir)):
        name, ext = os.path.splitext(file)
        if ext.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        if not force and exists(f"{TEX_DIR}/{name}"):
            continue
        tex = import_file(os.path.join(src_dir, file), TEX_DIR, name)
        if tex:
            configure_texture(tex, name)
            log(f"텍스처 {name}")


def import_audio(force):
    src_dir = os.path.join(project_dir(), "SourceArt", "Audio")
    for file in sorted(os.listdir(src_dir)):
        name, ext = os.path.splitext(file)
        if ext.lower() != ".wav":
            continue
        if not force and exists(f"{AUD_DIR}/{name}"):
            continue
        snd = import_file(os.path.join(src_dir, file), AUD_DIR, name)
        if snd:
            if name.startswith("AMB_") or name.startswith("MUS_"):
                snd.set_editor_property("looping", True)
            EAL.save_loaded_asset(snd)
            log(f"소리 {name}")


# ───────────────────────────── 머티리얼 ─────────────────────────────
def tex(name):
    return EAL.load_asset(f"{TEX_DIR}/{name}")


class Graph:
    """머티리얼 노드를 짧게 잇는 도우미"""

    def __init__(self, name, force):
        path = f"{MAT_DIR}/{name}"
        self.skip = exists(path) and not force
        if self.skip:
            self.mat = None
            return
        if exists(path):
            EAL.delete_asset(path)
        self.mat = AT.create_asset(name, MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
        self.name = name
        self.y = 0

    def set(self, **props):
        for k, v in props.items():
            self.mat.set_editor_property(k, v)

    def node(self, cls, x=-600, **props):
        self.y += 160
        e = MEL.create_material_expression(self.mat, cls, x, self.y)
        for k, v in props.items():
            e.set_editor_property(k, v)
        return e

    def vector(self, name, rgba):
        return self.node(unreal.MaterialExpressionVectorParameter, parameter_name=name, default_value=unreal.LinearColor(*rgba))

    def scalar(self, name, value):
        return self.node(unreal.MaterialExpressionScalarParameter, parameter_name=name, default_value=value)

    def const(self, value):
        return self.node(unreal.MaterialExpressionConstant, x=-300, r=value)

    def texture(self, name, texture, sampler, uv=None):
        e = self.node(unreal.MaterialExpressionTextureSampleParameter2D, x=-400, parameter_name=name, texture=texture, sampler_type=sampler)
        if uv is not None:
            MEL.connect_material_expressions(uv, "", e, "UVs")
        return e

    def mul(self, a, b, a_out="", b_out=""):
        m = self.node(unreal.MaterialExpressionMultiply, x=-200)
        MEL.connect_material_expressions(a, a_out, m, "A")
        MEL.connect_material_expressions(b, b_out, m, "B")
        return m

    def tiled_uv(self, default_tiling):
        tc = self.node(unreal.MaterialExpressionTextureCoordinate, x=-900)
        tiling = self.scalar("Tiling", default_tiling)
        return self.mul(tc, tiling)

    def out(self, expr, prop, output=""):
        MEL.connect_material_property(expr, output, prop)

    def finish(self):
        MEL.layout_material_expressions(self.mat)
        MEL.recompile_material(self.mat)
        EAL.save_loaded_asset(self.mat)
        log(f"머티리얼 {self.name}")


P = unreal.MaterialProperty
S = unreal.MaterialSamplerType


def build_materials(force):
    # 한지: 섬유 결 알베도 + 노멀, 거친 무광
    g = Graph("M_Hanji", force)
    if not g.skip:
        uv = g.tiled_uv(4.0)
        g.out(g.texture("Albedo", tex("T_Hanji_D"), S.SAMPLERTYPE_COLOR, uv), P.MP_BASE_COLOR)
        g.out(g.texture("NormalMap", tex("T_Hanji_N"), S.SAMPLERTYPE_NORMAL, uv), P.MP_NORMAL)
        g.out(g.const(0.88), P.MP_ROUGHNESS)
        g.out(g.const(0.3), P.MP_SPECULAR)
        g.finish()

    # 마루: 소나무 널, 닳아서 은은한 윤
    g = Graph("M_Maru", force)
    if not g.skip:
        uv = g.tiled_uv(4.0)
        g.out(g.texture("Albedo", tex("T_Maru_D"), S.SAMPLERTYPE_COLOR, uv), P.MP_BASE_COLOR)
        g.out(g.texture("NormalMap", tex("T_Maru_N"), S.SAMPLERTYPE_NORMAL, uv), P.MP_NORMAL)
        g.out(g.const(0.48), P.MP_ROUGHNESS)
        g.out(g.const(0.5), P.MP_SPECULAR)
        g.finish()

    # 도장 손잡이·받침 나무 (색은 C++에서)
    g = Graph("M_Wood", force)
    if not g.skip:
        g.out(g.vector("Color", (0.21, 0.09, 0.03, 1.0)), P.MP_BASE_COLOR)
        g.out(g.const(0.42), P.MP_ROUGHNESS)
        g.out(g.const(0.5), P.MP_SPECULAR)
        g.finish()

    # 놋쇠
    g = Graph("M_Brass", force)
    if not g.skip:
        g.out(g.vector("Color", (0.62, 0.40, 0.12, 1.0)), P.MP_BASE_COLOR)
        g.out(g.const(1.0), P.MP_METALLIC)
        g.out(g.const(0.3), P.MP_ROUGHNESS)
        g.finish()

    # 옻칠 (선수 색)
    g = Graph("M_Lacquer", force)
    if not g.skip:
        g.out(g.vector("Color", (0.3, 0.02, 0.01, 1.0)), P.MP_BASE_COLOR)
        g.out(g.const(0.16), P.MP_ROUGHNESS)
        g.out(g.const(0.7), P.MP_SPECULAR)
        g.finish()

    # 청자빛 아크릴 자: 반투명, 표면 반사
    g = Graph("M_Acrylic", force)
    if not g.skip:
        g.set(blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT,
              translucency_lighting_mode=unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
        g.out(g.vector("Color", (0.40, 0.56, 0.47, 1.0)), P.MP_BASE_COLOR)
        g.out(g.scalar("Opacity", 0.34), P.MP_OPACITY)
        g.out(g.const(0.06), P.MP_ROUGHNESS)
        g.out(g.const(0.9), P.MP_SPECULAR)
        g.finish()

    # 판정·안내 표시: 한지 위에 뜨는 반투명 판 (빛을 받아 종이와 어울리게, 살짝 빛남)
    g = Graph("M_Overlay", force)
    if not g.skip:
        g.set(blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT,
              translucency_lighting_mode=unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
        color = g.vector("Color", (1.0, 1.0, 1.0, 1.0))
        mask = g.texture("Mask", tex("T_Mask_Solid"), S.SAMPLERTYPE_LINEAR_GRAYSCALE)
        opacity = g.scalar("Opacity", 1.0)
        g.out(color, P.MP_BASE_COLOR)
        g.out(g.mul(color, g.const(0.25)), P.MP_EMISSIVE_COLOR)
        g.out(g.mul(mask, opacity, a_out="R"), P.MP_OPACITY)
        g.out(g.const(0.9), P.MP_ROUGHNESS)
        g.finish()

    # 인주 데칼: 한지 결 위에 스며든 도장 자국
    g = Graph("MD_Ink", force)
    if not g.skip:
        g.set(material_domain=unreal.MaterialDomain.MD_DEFERRED_DECAL,
              blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT)
        color = g.vector("Color", (0.45, 0.02, 0.01, 1.0))
        mask = g.texture("Mask", tex("T_Seal_Shu_0"), S.SAMPLERTYPE_LINEAR_GRAYSCALE)
        opacity = g.scalar("Opacity", 1.0)
        g.out(color, P.MP_BASE_COLOR)
        g.out(g.mul(mask, opacity, a_out="R"), P.MP_OPACITY)
        g.out(g.const(0.62), P.MP_ROUGHNESS)
        g.finish()


# ───────────────────────────── 맵 ─────────────────────────────
def ensure_map(force):
    # 맵은 다시 만들기(force)여도 덮어쓰지 않는다: 사용자가 꾸몄을 수 있음
    if exists(MAP_PATH):
        return
    try:
        subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        subsystem.new_level(MAP_PATH)
        subsystem.save_current_level()
    except Exception:  # 5.0 호환
        unreal.EditorLevelLibrary.new_level(MAP_PATH)
        unreal.EditorLevelLibrary.save_current_level()
    log("맵 StampOmok (조명·판·카메라는 플레이할 때 C++이 만든다)")


def run(force=False):
    log("셋업 시작" + (" (다시 만들기)" if force else ""))
    with unreal.ScopedSlowTask(4, "도장오목 에셋 만드는 중") as task:
        task.make_dialog(True)
        task.enter_progress_frame(1, "텍스처")
        import_textures(force)
        task.enter_progress_frame(1, "소리")
        import_audio(force)
        task.enter_progress_frame(1, "머티리얼")
        build_materials(force)
        task.enter_progress_frame(1, "맵")
        ensure_map(force)
    log("셋업 끝. 플레이(Alt+P)하세요.")


def missing():
    need = [f"{MAT_DIR}/M_Hanji", f"{MAT_DIR}/MD_Ink", f"{MAT_DIR}/M_Overlay", f"{TEX_DIR}/T_Hanji_D", f"{AUD_DIR}/SFX_Stamp", MAP_PATH]
    return [p for p in need if not exists(p)]


if __name__ == "__main__":
    run(force=False)
