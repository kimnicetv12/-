"""에디터가 켜질 때 자동 실행: 도장오목 에셋이 없으면 한 번 만든다."""
import unreal

_handle = None


def _first_tick(delta_seconds):
    global _handle
    if _handle is not None:
        unreal.unregister_slate_post_tick_callback(_handle)
        _handle = None
    try:
        import stamp_omok_setup
        if stamp_omok_setup.missing():
            stamp_omok_setup.run(force=False)
    except Exception as exc:  # 셋업이 실패해도 에디터는 계속 쓸 수 있게
        unreal.log_error(f"[StampOmok] 자동 셋업 실패: {exc}. 출력 로그에서 stamp_omok_setup.run(force=True) 로 다시 시도하세요.")


_handle = unreal.register_slate_post_tick_callback(_first_tick)
