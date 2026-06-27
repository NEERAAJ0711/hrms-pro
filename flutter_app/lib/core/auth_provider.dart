import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'api_client.dart';

class UserData {
  final String id;
  final String username;
  final String firstName;
  final String lastName;
  final String? email;
  final String role;
  final String? companyId;
  final String status;

  UserData({
    required this.id,
    required this.username,
    required this.firstName,
    required this.lastName,
    this.email,
    required this.role,
    this.companyId,
    required this.status,
  });

  factory UserData.fromJson(Map<String, dynamic> json) {
    return UserData(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      firstName: json['firstName'] ?? '',
      lastName: json['lastName'] ?? '',
      email: json['email'],
      role: json['role'] ?? 'employee',
      companyId: json['companyId'],
      status: json['status'] ?? 'active',
    );
  }

  bool get hasCompany => companyId != null && companyId!.isNotEmpty;

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'firstName': firstName,
        'lastName': lastName,
        'email': email,
        'role': role,
        'companyId': companyId,
        'status': status,
      };
}

class AuthProvider extends ChangeNotifier {
  final ApiClient _api = ApiClient();
  UserData? _user;
  bool _isLoading = true;
  String? _error;

  UserData? get user => _user;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _user != null;
  String? get error => _error;

  AuthProvider() {
    _api.onAuthFailure = () {
      _user = null;
      notifyListeners();
    };
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    _isLoading = true;
    notifyListeners();
    final token = await _api.getAccessToken();
    if (token == null) {
      _user = null;
      _isLoading = false;
      notifyListeners();
      return;
    }
    // We have a saved token — restore the cached user immediately so the app
    // opens straight to the home screen without waiting for the network.
    _user = await _loadCachedUser();
    // Try to confirm/refresh the profile. We retry a couple of times so a
    // transient startup network blip doesn't bounce a still-valid session to
    // the login screen when no cached profile is available yet.
    const maxAttempts = 2;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        final response = await _api.dio.get('/api/mobile/auth/me');
        _user = UserData.fromJson(response.data);
        await _cacheUser(_user!);
        break;
      } catch (e) {
        // The 401 interceptor clears the tokens (and triggers onAuthFailure)
        // only when the refresh token is also invalid — a genuine auth
        // failure. In that case the token below will be null and we log out.
        final stillHasToken = await _api.getAccessToken();
        if (stillHasToken == null) {
          _user = null;
          await _api.clearTokens();
          break;
        }
        // Token is still valid but the call failed transiently (offline,
        // server down, timeout). Keep the cached session if we have one.
        if (_user != null || attempt >= maxAttempts) break;
        await Future.delayed(const Duration(seconds: 2));
      }
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<UserData?> _loadCachedUser() async {
    try {
      final raw = await _api.getUserData();
      if (raw == null || raw.isEmpty) return null;
      return UserData.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> _cacheUser(UserData user) async {
    try {
      await _api.saveUserData(jsonEncode(user.toJson()));
    } catch (_) {
      // ignore cache write failures
    }
  }

  Future<bool> login(String username, String password) async {
    _error = null;
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.dio.post('/api/mobile/auth/login', data: {
        'username': username,
        'password': password,
      });
      await _api.saveTokens(response.data['accessToken'], response.data['refreshToken']);
      _user = UserData.fromJson(response.data['user']);
      await _cacheUser(_user!);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Invalid username or password';
      if (e is DioException && e.response?.data != null) {
        _error = e.response?.data['error'] ?? _error;
      }
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> signup(String username, String password, String email, String firstName, String lastName, {String? employeeCode}) async {
    _error = null;
    _isLoading = true;
    notifyListeners();
    try {
      final Map<String, dynamic> body = {
        'username': username,
        'password': password,
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'role': 'employee',
      };
      if (employeeCode != null && employeeCode.trim().isNotEmpty) {
        body['employeeCode'] = employeeCode.trim();
      }
      final response = await _api.dio.post('/api/mobile/auth/signup', data: body);
      await _api.saveTokens(response.data['accessToken'], response.data['refreshToken']);
      _user = UserData.fromJson(response.data['user']);
      await _cacheUser(_user!);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Signup failed';
      if (e is DioException && e.response?.data != null) {
        _error = e.response?.data['error'] ?? _error;
      }
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _api.clearTokens();
    _user = null;
    notifyListeners();
  }

  Future<void> refreshUser() async {
    try {
      final response = await _api.dio.get('/api/mobile/auth/me');
      _user = UserData.fromJson(response.data);
      await _cacheUser(_user!);
      notifyListeners();
    } catch (e) {
      // ignore
    }
  }
}
