#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>

static void join_path(wchar_t *out, size_t capacity, const wchar_t *base, const wchar_t *name) {
  _snwprintf(out, capacity, L"%ls\\%ls", base, name);
  out[capacity - 1] = L'\0';
}

static int read_file(const wchar_t *path, char *buffer, DWORD capacity, FILETIME *modified) {
  HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                            NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return 0;
  DWORD size = GetFileSize(file, NULL);
  if (size == INVALID_FILE_SIZE || size >= capacity) { CloseHandle(file); return 0; }
  DWORD read = 0;
  int ok = ReadFile(file, buffer, size, &read, NULL) && read == size;
  if (ok && modified) ok = GetFileTime(file, NULL, NULL, modified);
  CloseHandle(file);
  if (!ok) return 0;
  buffer[read] = '\0';
  return 1;
}

static int json_string(const char *json, const char *key, char *out, size_t capacity) {
  char needle[96];
  _snprintf(needle, sizeof(needle), "\"%s\"", key);
  const char *cursor = strstr(json, needle);
  if (!cursor) return 0;
  cursor = strchr(cursor + strlen(needle), ':');
  if (!cursor) return 0;
  cursor++;
  while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n') cursor++;
  if (*cursor++ != '"') return 0;
  size_t length = 0;
  while (*cursor && *cursor != '"') {
    if (*cursor == '\\') return 0;
    if (length + 1 >= capacity) return 0;
    out[length++] = *cursor++;
  }
  if (*cursor != '"') return 0;
  out[length] = '\0';
  return 1;
}

static uint64_t unix_millis(void) {
  FILETIME now;
  GetSystemTimeAsFileTime(&now);
  ULARGE_INTEGER value;
  value.LowPart = now.dwLowDateTime;
  value.HighPart = now.dwHighDateTime;
  return (value.QuadPart - 116444736000000000ULL) / 10000ULL;
}

static void write_diagnostic(const wchar_t *ipc_dir, const wchar_t *message) {
  wchar_t path[MAX_PATH];
  join_path(path, MAX_PATH, ipc_dir, L"hook-error.log");
  HANDLE file = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, NULL, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return;
  char utf8[512];
  int length = WideCharToMultiByte(CP_UTF8, 0, message, -1, utf8, sizeof(utf8), NULL, NULL);
  if (length > 1) {
    DWORD written;
    WriteFile(file, utf8, (DWORD)(length - 1), &written, NULL);
  }
  CloseHandle(file);
}

static int queue_event(const char *source, wchar_t *ipc_dir) {
  wchar_t runtime_path[MAX_PATH], inbox_dir[MAX_PATH], temporary[MAX_PATH], destination[MAX_PATH];
  join_path(runtime_path, MAX_PATH, ipc_dir, L"runtime.json");
  join_path(inbox_dir, MAX_PATH, ipc_dir, L"inbox");

  char runtime[8192], token[256];
  FILETIME modified, now;
  if (!read_file(runtime_path, runtime, sizeof(runtime), &modified)) return 0;
  GetSystemTimeAsFileTime(&now);
  ULARGE_INTEGER modified_value, now_value;
  modified_value.LowPart = modified.dwLowDateTime;
  modified_value.HighPart = modified.dwHighDateTime;
  now_value.LowPart = now.dwLowDateTime;
  now_value.HighPart = now.dwHighDateTime;
  if (now_value.QuadPart > modified_value.QuadPart + 100000000ULL) return 0;
  if (!strstr(runtime, "\"version\": 1") && !strstr(runtime, "\"version\":1")) return 0;
  if (!strstr(runtime, "\"transport\": \"file\"") && !strstr(runtime, "\"transport\":\"file\"")) return 0;
  if (!json_string(runtime, "token", token, sizeof(token)) || strlen(token) < 16) return 0;

  CreateDirectoryW(inbox_dir, NULL);
  DWORD pid = GetCurrentProcessId();
  ULONGLONG tick = GetTickCount64();
  _snwprintf(temporary, MAX_PATH, L"%ls\\.%lu-%llu.tmp", inbox_dir, (unsigned long)pid, tick);
  _snwprintf(destination, MAX_PATH, L"%ls\\%lu-%llu.json", inbox_dir, (unsigned long)pid, tick);

  char request[2048];
  int length = _snprintf(request, sizeof(request),
    "{\"protocolVersion\":1,\"token\":\"%s\",\"event\":{\"version\":1,\"source\":\"%s\",\"eventType\":\"turnStopped\",\"sessionId\":null,\"turnId\":null,\"cwd\":null,\"timestamp\":%llu}}\n",
    token, source, (unsigned long long)unix_millis());
  if (length <= 0 || length >= (int)sizeof(request)) return 0;

  HANDLE file = CreateFileW(temporary, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return 0;
  DWORD written = 0;
  int ok = WriteFile(file, request, (DWORD)length, &written, NULL) && written == (DWORD)length;
  FlushFileBuffers(file);
  CloseHandle(file);
  if (!ok || !MoveFileExW(temporary, destination, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    DeleteFileW(temporary);
    return 0;
  }
  return 1;
}

int main(int argc, char **argv) {
  wchar_t temp[MAX_PATH], ipc_dir[MAX_PATH];
  DWORD length = GetTempPathW(MAX_PATH, temp);
  const char *source = argc > 1 ? argv[1] : "";
  if (length == 0 || length >= MAX_PATH || (strcmp(source, "codex") && strcmp(source, "claude"))) {
    fputs("{\"continue\":true}\n", stdout);
    return 0;
  }
  while (length > 0 && (temp[length - 1] == L'\\' || temp[length - 1] == L'/')) temp[--length] = L'\0';
  join_path(ipc_dir, MAX_PATH, temp, L"agent-monitor-ipc");
  CreateDirectoryW(ipc_dir, NULL);

  /* Drain stdin so Codex can complete its normal hook protocol. */
  char drain[4096];
  while (fread(drain, 1, sizeof(drain), stdin) > 0) { }

  if (!queue_event(source, ipc_dir)) write_diagnostic(ipc_dir, L"Agent Monitor hook could not queue the notification event.\n");
  /* Monitoring must never fail or block the user's Codex turn. */
  fputs("{\"continue\":true}\n", stdout);
  fflush(stdout);
  return 0;
}
