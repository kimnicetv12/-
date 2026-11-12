package studio.infocut.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import android.view.WindowManager;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * InfoCut 앱 전용 기능: 휴대폰 기본 목소리를 파일로 만들기, 갤러리·다운로드 폴더에 저장, 공유, 화면 켜 두기.
 */
@CapacitorPlugin(name = "InfoCut")
public class InfoCutPlugin extends Plugin {

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private final Map<String, PluginCall> speaking = new ConcurrentHashMap<>();
    private final Map<String, File> speakFiles = new ConcurrentHashMap<>();

    private final Map<String, OutputStream> streams = new ConcurrentHashMap<>();
    private final Map<String, Uri> uris = new ConcurrentHashMap<>();

    /* ---------- 기본 목소리 ---------- */

    private interface Ready {
        void run();
    }

    private synchronized void withTts(final PluginCall call, final Ready then) {
        if (tts != null && ttsReady) {
            then.run();
            return;
        }
        tts = new TextToSpeech(getContext().getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                tts = null;
                call.reject("기본 목소리 엔진이 없어요. 휴대폰 설정에서 글자 읽어주기(TTS) 엔진을 설치해 주세요.");
                return;
            }
            ttsReady = true;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {}

                @Override
                public void onDone(String id) {
                    finishSpeak(id, null);
                }

                @Override
                public void onError(String id) {
                    finishSpeak(id, "목소리를 만들지 못했어요.");
                }

                @Override
                public void onError(String id, int code) {
                    finishSpeak(id, "목소리를 만들지 못했어요. (" + code + ")");
                }
            });
            then.run();
        });
    }

    private void finishSpeak(String id, String error) {
        PluginCall call = speaking.remove(id);
        File file = speakFiles.remove(id);
        if (call == null) return;
        try {
            if (error != null || file == null || !file.exists() || file.length() < 64) {
                call.reject(error != null ? error : "목소리 파일이 비어 있어요.");
                return;
            }
            byte[] bytes = new byte[(int) file.length()];
            try (FileInputStream in = new FileInputStream(file)) {
                int at = 0;
                while (at < bytes.length) {
                    int n = in.read(bytes, at, bytes.length - at);
                    if (n < 0) break;
                    at += n;
                }
            }
            JSObject out = new JSObject();
            out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(out);
        } catch (Exception e) {
            call.reject("목소리 파일을 읽지 못했어요.", e);
        } finally {
            if (file != null) file.delete();
        }
    }

    @PluginMethod
    public void voices(final PluginCall call) {
        withTts(call, () -> {
            JSArray list = new JSArray();
            try {
                Set<Voice> all = tts.getVoices();
                if (all != null) {
                    for (Voice v : all) {
                        if (v.getLocale() == null || !"ko".equals(v.getLocale().getLanguage())) continue;
                        JSObject o = new JSObject();
                        o.put("id", v.getName());
                        o.put("name", v.getName() + (v.isNetworkConnectionRequired() ? " (온라인)" : ""));
                        list.put(o);
                    }
                }
            } catch (Exception ignored) {
                // 목록을 못 읽으면 기본 목소리만 쓴다
            }
            JSObject out = new JSObject();
            out.put("voices", list);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void speak(final PluginCall call) {
        final String text = call.getString("text", "");
        final String voiceName = call.getString("voice", "");
        final Double rate = call.getDouble("rate", 1.0);
        if (text == null || text.trim().isEmpty()) {
            call.reject("읽을 문장이 없어요.");
            return;
        }
        withTts(call, () -> {
            try {
                int lang = tts.setLanguage(Locale.KOREAN);
                if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                    call.reject("한국어 목소리 데이터가 없어요. 휴대폰 설정 > 글자 읽어주기에서 한국어를 내려받아 주세요.");
                    return;
                }
                if (voiceName != null && !voiceName.isEmpty()) {
                    Set<Voice> all = tts.getVoices();
                    if (all != null) {
                        for (Voice v : all) {
                            if (voiceName.equals(v.getName())) {
                                tts.setVoice(v);
                                break;
                            }
                        }
                    }
                }
                tts.setSpeechRate(rate == null ? 1.0f : rate.floatValue());
                String id = UUID.randomUUID().toString();
                File out = new File(getContext().getCacheDir(), "tts_" + id + ".wav");
                speaking.put(id, call);
                speakFiles.put(id, out);
                int r = tts.synthesizeToFile(text, new Bundle(), out, id);
                if (r != TextToSpeech.SUCCESS) finishSpeak(id, "목소리를 만들지 못했어요.");
            } catch (Exception e) {
                call.reject("목소리를 만들지 못했어요.", e);
            }
        });
    }

    /* ---------- 파일 저장 (조각으로 나눠 받는다) ---------- */

    @PluginMethod
    public void saveBegin(PluginCall call) {
        String name = call.getString("name", "infocut");
        String mime = call.getString("mime", "application/octet-stream");
        boolean movies = "movies".equals(call.getString("folder", "downloads"));
        String id = UUID.randomUUID().toString();
        try {
            Uri uri;
            OutputStream stream;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, (movies ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_DOWNLOADS) + "/InfoCut");
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = movies
                    ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                uri = resolver.insert(collection, values);
                if (uri == null) {
                    call.reject("저장할 자리를 만들지 못했어요.");
                    return;
                }
                stream = resolver.openOutputStream(uri);
            } else {
                File dir = getContext().getExternalFilesDir(movies ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) {
                    call.reject("저장 공간을 쓸 수 없어요.");
                    return;
                }
                File file = new File(dir, name);
                stream = new FileOutputStream(file);
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            }
            if (stream == null) {
                call.reject("파일을 열지 못했어요.");
                return;
            }
            streams.put(id, stream);
            uris.put(id, uri);
            JSObject out = new JSObject();
            out.put("id", id);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("저장을 시작하지 못했어요.", e);
        }
    }

    @PluginMethod
    public void saveChunk(PluginCall call) {
        OutputStream stream = streams.get(call.getString("id", ""));
        String data = call.getString("base64", "");
        if (stream == null) {
            call.reject("저장 중인 파일이 없어요.");
            return;
        }
        try {
            stream.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject("저장 공간이 부족하거나 파일을 쓸 수 없어요.", e);
        }
    }

    @PluginMethod
    public void saveEnd(PluginCall call) {
        String id = call.getString("id", "");
        OutputStream stream = streams.remove(id);
        Uri uri = uris.remove(id);
        if (stream == null || uri == null) {
            call.reject("저장 중인 파일이 없어요.");
            return;
        }
        try {
            stream.flush();
            stream.close();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, done, null, null);
            }
            JSObject out = new JSObject();
            out.put("uri", uri.toString());
            call.resolve(out);
        } catch (Exception e) {
            call.reject("저장을 끝내지 못했어요.", e);
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        String uri = call.getString("uri", "");
        String mime = call.getString("mime", "*/*");
        String title = call.getString("title", "InfoCut");
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("공유 화면을 열지 못했어요.", e);
        }
    }

    /* ---------- 영상 만드는 동안 화면 켜 두기 ---------- */

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
            ttsReady = false;
        }
        for (OutputStream s : streams.values()) {
            try {
                s.close();
            } catch (Exception ignored) {
                // 닫는 중 오류는 무시
            }
        }
        streams.clear();
        super.handleOnDestroy();
    }
}
