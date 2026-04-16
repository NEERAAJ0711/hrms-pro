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
    try {
      final token = await _api.getAccessToken();
      if (token != null) {
        final response = await _api.dio.get('/api/mobile/auth/me');
        _user = UserData.fromJson(response.data);
      }
    } catch (e) {
      _user = null;
      await _api.clearTokens();
    }
    _isLoading = false;
    notifyListeners();
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
      notifyListeners();
    } catch (e) {
      // ignore
    }
  }
}
