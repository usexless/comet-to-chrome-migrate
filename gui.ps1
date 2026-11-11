# Comet -> Chrome migration, GUI.
# Pure WPF/.NET from Windows -- no Electron, no npm, starts instantly.
# Calls migrate.js in the background and streams the log live.

Add-Type -AssemblyName PresentationFramework

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$migrate = Join-Path $root 'migrate.js'
$backupDir = Join-Path $env:LOCALAPPDATA 'comet-chrome-migrate\backup'

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Comet to Chrome" Height="700" Width="780"
        WindowStartupLocation="CenterScreen" Background="#0B0D12"
        FontFamily="Segoe UI" ResizeMode="CanMinimize">

  <Window.Resources>
    <SolidColorBrush x:Key="Accent" Color="#20C4A0"/>
    <SolidColorBrush x:Key="AccentDim" Color="#17A288"/>
    <SolidColorBrush x:Key="CardBg" Color="#14171E"/>
    <SolidColorBrush x:Key="CardBorder" Color="#252A34"/>
    <SolidColorBrush x:Key="TextMain" Color="#F2F4F7"/>
    <SolidColorBrush x:Key="TextDim" Color="#8C93A1"/>

    <LinearGradientBrush x:Key="TitleBrush" StartPoint="0,0" EndPoint="1,1">
      <GradientStop Color="#FFFFFF" Offset="0"/>
      <GradientStop Color="#20C4A0" Offset="1"/>
    </LinearGradientBrush>

    <Style x:Key="CardStyle" TargetType="Border">
      <Setter Property="Background" Value="{StaticResource CardBg}"/>
      <Setter Property="BorderBrush" Value="{StaticResource CardBorder}"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="CornerRadius" Value="12"/>
      <Setter Property="Padding" Value="18"/>
      <Setter Property="Margin" Value="0,0,0,12"/>
    </Style>

    <Style x:Key="PillButton" TargetType="Button">
      <Setter Property="Foreground" Value="#07110E"/>
      <Setter Property="Background" Value="{StaticResource Accent}"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="FontSize" Value="13"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Padding" Value="18,9"/>
      <Setter Property="BorderThickness" Value="0"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="Bd" Background="{TemplateBinding Background}" CornerRadius="20"
                    Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="Bd" Property="Background" Value="{StaticResource AccentDim}"/>
              </Trigger>
              <Trigger Property="IsEnabled" Value="False">
                <Setter TargetName="Bd" Property="Background" Value="#2C323D"/>
                <Setter Property="Foreground" Value="#5F6672"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="GhostButton" TargetType="Button" BasedOn="{StaticResource PillButton}">
      <Setter Property="Background" Value="#1D222C"/>
      <Setter Property="Foreground" Value="{StaticResource TextMain}"/>
    </Style>
  </Window.Resources>

  <Grid Margin="24">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>

    <Grid Grid.Row="0" Margin="0,0,0,20">
      <StackPanel HorizontalAlignment="Left">
        <TextBlock Text="Comet to Chrome" FontSize="28" FontWeight="Bold"
                   Foreground="{StaticResource TitleBrush}"/>
        <TextBlock Text="Move your sessions, passwords and history. No dialogs, no questions."
                   FontSize="13" Foreground="{StaticResource TextDim}" Margin="0,3,0,0"/>
      </StackPanel>
      <Button Name="BtnAll" Content="Migrate everything" Style="{StaticResource PillButton}"
              HorizontalAlignment="Right" VerticalAlignment="Center" Width="170"/>
    </Grid>

    <!-- Cookies -->
    <Border Grid.Row="1" Style="{StaticResource CardStyle}">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <Ellipse Grid.Column="0" Width="9" Height="9" Fill="{StaticResource Accent}"
                  VerticalAlignment="Center" Margin="0,0,16,0"/>
        <StackPanel Grid.Column="1">
          <TextBlock Text="Cookies" FontSize="15" FontWeight="SemiBold" Foreground="{StaticResource TextMain}"/>
          <TextBlock Text="Every login session, still signed in on the other side" FontSize="12"
                     Foreground="{StaticResource TextDim}" Margin="0,3,0,0"/>
        </StackPanel>
        <Button Name="BtnCookies" Grid.Column="2" Content="Migrate" Style="{StaticResource GhostButton}"
                VerticalAlignment="Center" Width="120"/>
      </Grid>
    </Border>

    <!-- Passwords -->
    <Border Grid.Row="2" Style="{StaticResource CardStyle}">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <Ellipse Grid.Column="0" Width="9" Height="9" Fill="{StaticResource Accent}"
                  VerticalAlignment="Center" Margin="0,0,16,0"/>
        <StackPanel Grid.Column="1">
          <TextBlock Text="Passwords" FontSize="15" FontWeight="SemiBold" Foreground="{StaticResource TextMain}"/>
          <TextBlock Text="No Windows Hello, no prompts, no plaintext file" FontSize="12"
                     Foreground="{StaticResource TextDim}" Margin="0,3,0,0"/>
        </StackPanel>
        <Button Name="BtnPasswords" Grid.Column="2" Content="Migrate" Style="{StaticResource GhostButton}"
                VerticalAlignment="Center" Width="120"/>
      </Grid>
    </Border>

    <!-- History -->
    <Border Grid.Row="3" Style="{StaticResource CardStyle}">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <Ellipse Grid.Column="0" Width="9" Height="9" Fill="{StaticResource Accent}"
                  VerticalAlignment="Center" Margin="0,0,16,0"/>
        <StackPanel Grid.Column="1">
          <TextBlock Text="History &amp; autofill" FontSize="15" FontWeight="SemiBold" Foreground="{StaticResource TextMain}"/>
          <TextBlock Text="History, downloads, search terms, form entries" FontSize="12"
                     Foreground="{StaticResource TextDim}" Margin="0,3,0,0"/>
        </StackPanel>
        <Button Name="BtnHistory" Grid.Column="2" Content="Migrate" Style="{StaticResource GhostButton}"
                VerticalAlignment="Center" Width="120"/>
      </Grid>
    </Border>

    <!-- Log -->
    <Border Grid.Row="4" Style="{StaticResource CardStyle}" Padding="0" Margin="0,4,0,0">
      <Grid>
        <Grid.RowDefinitions>
          <RowDefinition Height="Auto"/>
          <RowDefinition Height="*"/>
        </Grid.RowDefinitions>
        <TextBlock Grid.Row="0" Text="LOG" FontSize="10" FontWeight="Bold" Foreground="{StaticResource TextDim}"
                   Margin="16,12,0,8"/>
        <TextBox Name="Log" Grid.Row="1" Background="Transparent" BorderThickness="0"
                  Foreground="#AEB5C2" FontFamily="Cascadia Mono, Consolas" FontSize="12"
                  IsReadOnly="True" VerticalScrollBarVisibility="Auto"
                  HorizontalScrollBarVisibility="Auto" TextWrapping="Wrap"
                  Padding="16,0,16,16"/>
      </Grid>
    </Border>

    <TextBlock Grid.Row="5" Name="Footer" Text="Ready."
               FontSize="11" Foreground="{StaticResource TextDim}" Margin="4,10,0,0"/>
  </Grid>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

$log = $window.FindName('Log')
$footer = $window.FindName('Footer')
$buttons = @(
  $window.FindName('BtnAll'),
  $window.FindName('BtnCookies'),
  $window.FindName('BtnPasswords'),
  $window.FindName('BtnHistory')
)

function Append-Log([string]$text) {
  $log.Dispatcher.Invoke([action]{
    $log.AppendText("$text`r`n")
    $log.ScrollToEnd()
  })
}

function Set-Busy([bool]$busy, [string]$label) {
  foreach ($b in $buttons) { $b.IsEnabled = -not $busy }
  $footer.Text = if ($busy) { "Working: $label. Comet and Chrome get closed and reopened automatically." }
                 else { "Idle. Nothing is uploaded, everything stays on this machine." }
}

function Run-Migrate([string]$subcommand) {
  Set-Busy $true $subcommand
  Append-Log "=== $subcommand started ==="
  $job = Start-Job -ScriptBlock {
    param($migratePath, $sub)
    & node $migratePath $sub 2>&1
  } -ArgumentList $migrate, $subcommand

  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(400)
  $timer.Add_Tick({
    Receive-Job $job | ForEach-Object { Append-Log $_ }
    if ($job.State -in @('Completed', 'Failed', 'Stopped')) {
      Receive-Job $job | ForEach-Object { Append-Log $_ }
      $ok = ($job.State -eq 'Completed')
      Append-Log ("=== {0} finished ({1}) ===" -f $subcommand, $job.State)
      Remove-Job $job -Force
      $timer.Stop()
      Set-Busy $false $subcommand
      if ($ok) {
        Append-Log "Open Chrome and check. Backups: $backupDir"
      } else {
        Append-Log "Something went wrong -- scroll up. Backups: $backupDir"
      }
    }
  })
  $timer.Start()
}

$window.FindName('BtnCookies').Add_Click({ Run-Migrate 'cookies' })
$window.FindName('BtnPasswords').Add_Click({ Run-Migrate 'passwords' })
$window.FindName('BtnHistory').Add_Click({ Run-Migrate 'history' })
$window.FindName('BtnAll').Add_Click({ Run-Migrate 'all' })

Append-Log "Ready. Pick one, or hit 'Migrate everything'."
Append-Log "Comet and Chrome are closed automatically if they are running."
Append-Log "Backups: $backupDir"
Set-Busy $false ''
$window.ShowDialog() | Out-Null
