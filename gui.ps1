# Comet -> Chrome Migration, GUI.
# Reines WPF/.NET aus Windows -- kein Electron, kein npm, startet sofort.
# Ruft migrate.js im Hintergrund auf und zeigt das Log live.

Add-Type -AssemblyName PresentationFramework

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$migrate = Join-Path $root 'migrate.js'
$backupDir = Join-Path $env:LOCALAPPDATA 'comet-chrome-migrate\backup'

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Comet nach Chrome" Height="660" Width="740"
        WindowStartupLocation="CenterScreen" Background="#0F1115"
        FontFamily="Segoe UI">

  <Window.Resources>
    <SolidColorBrush x:Key="Accent" Color="#20C4A0"/>
    <SolidColorBrush x:Key="AccentDim" Color="#17A288"/>
    <SolidColorBrush x:Key="CardBg" Color="#1A1D24"/>
    <SolidColorBrush x:Key="CardBorder" Color="#2A2E37"/>
    <SolidColorBrush x:Key="TextMain" Color="#ECEDEE"/>
    <SolidColorBrush x:Key="TextDim" Color="#9A9FA8"/>

    <Style x:Key="CardStyle" TargetType="Border">
      <Setter Property="Background" Value="{StaticResource CardBg}"/>
      <Setter Property="BorderBrush" Value="{StaticResource CardBorder}"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="CornerRadius" Value="10"/>
      <Setter Property="Padding" Value="16"/>
      <Setter Property="Margin" Value="0,0,0,12"/>
    </Style>

    <Style x:Key="PillButton" TargetType="Button">
      <Setter Property="Foreground" Value="#0F1115"/>
      <Setter Property="Background" Value="{StaticResource Accent}"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="FontSize" Value="13"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Padding" Value="16,8"/>
      <Setter Property="BorderThickness" Value="0"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="Bd" Background="{TemplateBinding Background}" CornerRadius="18"
                    Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="Bd" Property="Background" Value="{StaticResource AccentDim}"/>
              </Trigger>
              <Trigger Property="IsEnabled" Value="False">
                <Setter TargetName="Bd" Property="Background" Value="#3A3E47"/>
                <Setter Property="Foreground" Value="#6A6E77"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="GhostButton" TargetType="Button" BasedOn="{StaticResource PillButton}">
      <Setter Property="Background" Value="#232730"/>
      <Setter Property="Foreground" Value="{StaticResource TextMain}"/>
    </Style>
  </Window.Resources>

  <Grid Margin="20">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
    </Grid.RowDefinitions>

    <Grid Grid.Row="0" Margin="0,0,0,18">
      <StackPanel HorizontalAlignment="Left">
        <TextBlock Text="Comet nach Chrome" FontSize="26" FontWeight="Bold" Foreground="{StaticResource TextMain}"/>
        <TextBlock Text="Sitzungen, Passw&ouml;rter und Verlauf &uuml;bernehmen"
                   FontSize="13" Foreground="{StaticResource TextDim}" Margin="0,2,0,0"/>
      </StackPanel>
      <Button Name="BtnAll" Content="Alles migrieren" Style="{StaticResource PillButton}"
              HorizontalAlignment="Right" VerticalAlignment="Center" Width="150"/>
    </Grid>

    <!-- Cookies -->
    <Border Grid.Row="1" Style="{StaticResource CardStyle}">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <Ellipse Grid.Column="0" Width="8" Height="8" Fill="{StaticResource Accent}"
                  VerticalAlignment="Center" Margin="0,0,14,0"/>
        <StackPanel Grid.Column="1">
          <TextBlock Text="Cookies" FontSize="15" FontWeight="SemiBold" Foreground="{StaticResource TextMain}"/>
          <TextBlock Text="Alle Login-Sitzungen, voll automatisch" FontSize="12"
                     Foreground="{StaticResource TextDim}" Margin="0,2,0,0"/>
        </StackPanel>
        <Button Name="BtnCookies" Grid.Column="2" Content="Migrieren" Style="{StaticResource PillButton}"
                VerticalAlignment="Center" Width="120"/>
      </Grid>
    </Border>

    <!-- Passwoerter -->
    <Border Grid.Row="2" Style="{StaticResource CardStyle}">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <Ellipse Grid.Column="0" Width="8" Height="8" Fill="{StaticResource Accent}"
                  VerticalAlignment="Center" Margin="0,0,14,0"/>
        <StackPanel Grid.Column="1">
          <TextBlock Text="Passw&ouml;rter" FontSize="15" FontWeight="SemiBold" Foreground="{StaticResource TextMain}"/>
          <TextBlock Text="Ohne Windows Hello, ohne Dialoge, ohne Klartextdatei" FontSize="12"
                     Foreground="{StaticResource TextDim}" Margin="0,2,0,0"/>
        </StackPanel>
        <Button Name="BtnPasswords" Grid.Column="2" Content="Migrieren" Style="{StaticResource PillButton}"
                VerticalAlignment="Center" Width="120"/>
      </Grid>
    </Border>

    <!-- Verlauf -->
    <Border Grid.Row="3" Style="{StaticResource CardStyle}">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <Ellipse Grid.Column="0" Width="8" Height="8" Fill="{StaticResource Accent}"
                  VerticalAlignment="Center" Margin="0,0,14,0"/>
        <StackPanel Grid.Column="1">
          <TextBlock Text="Verlauf &amp; Autofill" FontSize="15" FontWeight="SemiBold" Foreground="{StaticResource TextMain}"/>
          <TextBlock Text="Verlauf, Downloads, Suchbegriffe, Formularfelder" FontSize="12"
                     Foreground="{StaticResource TextDim}" Margin="0,2,0,0"/>
        </StackPanel>
        <Button Name="BtnHistory" Grid.Column="2" Content="Migrieren" Style="{StaticResource PillButton}"
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
        <TextBlock Grid.Row="0" Text="PROTOKOLL" FontSize="10" FontWeight="Bold" Foreground="{StaticResource TextDim}"
                   Margin="14,10,0,6"/>
        <TextBox Name="Log" Grid.Row="1" Background="Transparent" BorderThickness="0"
                  Foreground="#B8BCC4" FontFamily="Cascadia Mono, Consolas" FontSize="12"
                  IsReadOnly="True" VerticalScrollBarVisibility="Auto"
                  HorizontalScrollBarVisibility="Auto" TextWrapping="Wrap"
                  Padding="14,0,14,14"/>
      </Grid>
    </Border>
  </Grid>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

$log = $window.FindName('Log')
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

function Set-Busy([bool]$busy) {
  foreach ($b in $buttons) { $b.IsEnabled = -not $busy }
}

function Run-Migrate([string]$subcommand) {
  Set-Busy $true
  Append-Log "=== $subcommand gestartet ==="
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
      Append-Log "=== $subcommand beendet ($($job.State)) ==="
      Remove-Job $job -Force
      $timer.Stop()
      Set-Busy $false
    }
  })
  $timer.Start()
}

$window.FindName('BtnCookies').Add_Click({ Run-Migrate 'cookies' })
$window.FindName('BtnPasswords').Add_Click({ Run-Migrate 'passwords' })
$window.FindName('BtnHistory').Add_Click({ Run-Migrate 'history' })
$window.FindName('BtnAll').Add_Click({ Run-Migrate 'all' })

Append-Log "Bereit. Comet und Chrome werden bei Bedarf automatisch geschlossen."
Append-Log "Sicherungen: $backupDir"
$window.ShowDialog() | Out-Null
