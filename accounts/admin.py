from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import Invite, PlayerProfile


class PlayerProfileInline(admin.StackedInline):
    model = PlayerProfile
    fk_name = "user"
    can_delete = False


class UserAdmin(BaseUserAdmin):
    inlines = [PlayerProfileInline]


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ["token", "created_by", "label", "times_used", "max_uses", "is_active", "expires_at"]
    list_filter = ["is_active"]
    readonly_fields = ["token", "times_used", "created_at"]


admin.site.unregister(User)
admin.site.register(User, UserAdmin)
