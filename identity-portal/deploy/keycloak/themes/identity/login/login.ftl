<#import "template.ftl" as layout>

<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=true; section>
<!-- template: login.ftl (identity theme) -->

    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <div id="kc-form">
            <div id="kc-form-wrapper">
                <#if realm.password>
                    <form id="kc-form-login" onsubmit="login.disabled = true; return true;"
                          action="${url.loginAction}" method="post" novalidate="novalidate">

                        <#if !usernameHidden??>
                            <#-- Username field -->
                            <div class="form-item">
                                <label class="form-label" for="username">
                                    <#if !realm.loginWithEmailAllowed>${msg("username")}
                                    <#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}
                                    <#else>${msg("email")}</#if>
                                </label>
                                <div class="input-wrapper <#if messagesPerField.existsError('username','password')>input-error</#if>">
                                    <span class="input-icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                            <circle cx="12" cy="7" r="4"/>
                                        </svg>
                                    </span>
                                    <input id="username" name="username" class="form-input"
                                           type="text" autocomplete="username"
                                           value="${login.username!''}" autofocus
                                           placeholder="${msg('usernamePlaceholder')}"
                                           aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"/>
                                </div>
                            </div>
                        </#if>

                        <#-- Password field -->
                        <div class="form-item">
                            <label class="form-label" for="password">${msg("password")}</label>
                            <div class="input-wrapper <#if messagesPerField.existsError('password')>input-error</#if>">
                                <span class="input-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                    </svg>
                                </span>
                                <input id="password" name="password" class="form-input"
                                       type="password" autocomplete="current-password"
                                       <#if usernameHidden??>autofocus</#if>
                                       placeholder="${msg('passwordPlaceholder')}"
                                       aria-invalid="<#if messagesPerField.existsError('password')>true</#if>"/>
                                <button class="password-toggle-btn" type="button"
                                        aria-label="${msg('showPassword')}"
                                        aria-controls="password" data-password-toggle
                                        data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}"
                                        id="password-show-password">
                                    <svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                    <svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                                        <line x1="1" y1="1" x2="23" y2="23"/>
                                    </svg>
                                </button>
                            </div>
                            <#if messagesPerField.existsError('username','password')>
                                <div class="field-error">${messagesPerField.getFirstError('username','password')}</div>
                            </#if>
                        </div>

                        <input type="hidden" id="id-hidden-input" name="credentialId"
                               <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

                        <#-- Options row: remember me + forgot password -->
                        <div class="form-options">
                            <#if realm.rememberMe && !usernameHidden??>
                                <label class="remember-me">
                                    <input type="checkbox" id="rememberMe" name="rememberMe"
                                           <#if login.rememberMe??>checked</#if>/>
                                    <span class="remember-me-text">${msg("rememberMe")}</span>
                                </label>
                            <#else>
                                <span></span>
                            </#if>
                            <#if realm.resetPasswordAllowed>
                                <a href="${url.loginResetCredentialsUrl}" class="forgot-password">${msg("doForgotPassword")}</a>
                            </#if>
                        </div>

                        <#-- Submit button -->
                        <button type="submit" id="kc-login" name="login" class="login-submit-btn">
                            ${msg("doLogIn")}
                        </button>
                    </form>
                </#if>
            </div>
        </div>

    <#elseif section = "info">
        <div class="registration-link">
            <span>${msg("noAccount")}</span>
            <a href="http://localhost:3000/register">${msg("doRegister")}</a>
        </div>
    </#if>

</@layout.registrationLayout>
