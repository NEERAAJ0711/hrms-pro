import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  late Dio dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  String baseUrl = 'https://marpayrollnode.replit.app';
  bool _isRefreshing = false;
  final List<Function(String)> _refreshCallbacks = [];
  Function()? onAuthFailure;

  ApiClient._internal() {
    dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ));

    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401 &&
            !error.requestOptions.path.contains('/auth/')) {
          if (_isRefreshing) {
            try {
              final comp = Completer<String>();
              _refreshCallbacks.add(comp.complete);
              final newToken = await comp.future;
              error.requestOptions.headers['Authorization'] = 'Bearer $newToken';
              final response = await Dio(BaseOptions(baseUrl: baseUrl))
                  .fetch(error.requestOptions);
              return handler.resolve(response);
            } catch (_) {
              return handler.next(error);
            }
          }

          final refreshed = await _refreshToken();
          if (refreshed) {
            final token = await _storage.read(key: 'access_token');
            error.requestOptions.headers['Authorization'] = 'Bearer $token';
            try {
              final response = await Dio(BaseOptions(baseUrl: baseUrl))
                  .fetch(error.requestOptions);
              return handler.resolve(response);
            } catch (retryError) {
              return handler.next(retryError is DioException ? retryError : error);
            }
          } else {
            await clearTokens();
            onAuthFailure?.call();
          }
        }
        return handler.next(error);
      },
    ));
  }

  Future<void> initFromStorage() async {
    final savedUrl = await _storage.read(key: 'server_url');
    if (savedUrl != null && savedUrl.isNotEmpty) {
      updateBaseUrl(savedUrl);
    }
  }

  Future<void> saveServerUrl(String url) async {
    await _storage.write(key: 'server_url', value: url);
    updateBaseUrl(url);
  }

  Future<String> getSavedServerUrl() async {
    return await _storage.read(key: 'server_url') ?? baseUrl;
  }

  void updateBaseUrl(String url) {
    baseUrl = url;
    dio.options.baseUrl = url;
  }

  Future<bool> _refreshToken() async {
    _isRefreshing = true;
    try {
      final refreshToken = await _storage.read(key: 'refresh_token');
      if (refreshToken == null) {
        _isRefreshing = false;
        return false;
      }
      final response = await Dio().post(
        '$baseUrl/api/mobile/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      if (response.statusCode == 200) {
        final newAccessToken = response.data['accessToken'];
        await _storage.write(key: 'access_token', value: newAccessToken);
        if (response.data['refreshToken'] != null) {
          await _storage.write(key: 'refresh_token', value: response.data['refreshToken']);
        }
        for (final callback in _refreshCallbacks) {
          callback(newAccessToken);
        }
        _refreshCallbacks.clear();
        _isRefreshing = false;
        return true;
      }
      _isRefreshing = false;
      return false;
    } catch (e) {
      _refreshCallbacks.clear();
      _isRefreshing = false;
      await clearTokens();
      return false;
    }
  }

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    await _storage.write(key: 'access_token', value: accessToken);
    await _storage.write(key: 'refresh_token', value: refreshToken);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
  }

  Future<String?> getAccessToken() async {
    return await _storage.read(key: 'access_token');
  }

  Future<Response> get(String path, {Map<String, dynamic>? queryParameters}) async {
    return await dio.get(path, queryParameters: queryParameters);
  }

  Future<Response> post(String path, {dynamic data}) async {
    return await dio.post(path, data: data);
  }

  Future<Response> put(String path, {dynamic data}) async {
    return await dio.put(path, data: data);
  }

  Future<Response> patch(String path, {dynamic data}) async {
    return await dio.patch(path, data: data);
  }

  Future<Response> delete(String path, {dynamic data}) async {
    return await dio.delete(path, data: data);
  }
}
